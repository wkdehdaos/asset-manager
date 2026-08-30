"use client";

import { useMemo, useState, useTransition } from "react";
import {
  parseKakaoRows,
  summarizeKakao,
  extractAccountHolder,
  EXCLUDE_REASON_LABELS_KO,
  type KakaoDraft,
} from "@/core/kakaobank-import";
import { transactionKey } from "@/core/csv-import";
import {
  CATEGORIES,
  CATEGORY_LABELS_KO,
  type Category,
} from "@/core/types";
import { importTransactions, getCategoryRules } from "@/app/actions";
import { readSpreadsheetRows } from "./parse-actions";
import { formatWon } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const selectCls = cn(
  "h-9 rounded-md border border-input bg-background px-2 text-sm",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 미리보기용 중복 키 — 서버 dedup과 동일하게 방향까지 포함 (입금·지출 구분). */
function previewKey(d: KakaoDraft): string {
  return `${d.direction}|${transactionKey(d.date, d.amount)}`;
}

export function KakaoImportForm() {
  const [drafts, setDrafts] = useState<KakaoDraft[] | null>(null);
  const [holder, setHolder] = useState("");
  const [rules, setRules] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<
    { kind: "info" | "error"; text: string } | null
  >(null);
  const [reading, setReading] = useState(false);
  // 행별 사용자 재정의
  const [include, setInclude] = useState<Record<number, boolean>>({});
  const [catOverride, setCatOverride] = useState<Record<number, Category>>({});
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const summary = useMemo(
    () => (drafts ? summarizeKakao(drafts) : null),
    [drafts],
  );

  const marked = useMemo(() => {
    if (!drafts) return [];
    const seen = new Set<string>();
    return drafts.map((d) => {
      const key = previewKey(d);
      const duplicate = seen.has(key);
      if (!duplicate) seen.add(key);
      return { draft: d, duplicate };
    });
  }, [drafts]);

  const isChecked = (i: number, d: KakaoDraft, duplicate: boolean) =>
    include[i] ?? (!d.excluded && !duplicate);

  const willImport = marked.filter(({ draft }, i) =>
    isChecked(i, draft, marked[i]!.duplicate),
  );

  /** 파일(+비번)을 서버로 보내 행을 받아 파싱한다. 잠긴 파일이면 비번칸을 띄운다. */
  async function readFile(f: File, pw?: string) {
    setStatus(null);
    setResult(null);
    setReading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      if (pw) fd.append("password", pw);
      const res = await readSpreadsheetRows(fd);
      if (!res.ok) {
        if (res.reason === "password_required") {
          setNeedsPassword(true);
          setStatus({ kind: "info", text: res.message });
        } else if (res.reason === "password_wrong") {
          setNeedsPassword(true);
          setStatus({ kind: "error", text: res.message });
        } else {
          setStatus({ kind: "error", text: res.message });
        }
        setDrafts(null);
        return;
      }
      // 학습된 규칙을 불러와 자동 적용 (전에 정한 분류 재현)
      const learned = await getCategoryRules();
      setRules(learned);
      const parsed = parseKakaoRows(res.rows, {
        categoryByContent: learned as Record<string, Category>,
      });
      if (parsed.length === 0) {
        setStatus({
          kind: "error",
          text: "카카오뱅크 거래내역 형식을 찾지 못했어요. '거래일시' 헤더가 있는 파일인지 확인해 주세요.",
        });
        setDrafts(null);
        return;
      }
      setHolder(extractAccountHolder(res.rows));
      setDrafts(parsed);
      setNeedsPassword(false);
      setInclude({});
      setCatOverride({});
    } finally {
      setReading(false);
    }
  }

  function onPick(f: File | undefined | null) {
    if (!f) return;
    setFile(f);
    setPassword("");
    setNeedsPassword(false);
    setDrafts(null);
    void readFile(f);
  }

  if (result) {
    return (
      <div className="space-y-3 text-sm">
        <p>
          <b>{result.inserted}건</b> 추가, 중복·제외 <b>{result.skipped}건</b>{" "}
          건너뜀.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setResult(null);
            setFile(null);
          }}
        >
          다른 파일 가져오기
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 드래그앤드롭 존 */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onPick(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-input",
        )}
      >
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <span className="text-sm font-medium">
          {file ? file.name : "여기로 파일을 끌어다 놓거나 클릭해서 선택"}
        </span>
        <span className="text-xs text-muted-foreground">
          카카오뱅크 거래내역 파일 (.xlsx · .xls · .csv) — 잠긴 원본 그대로 OK
        </span>
      </label>

      {reading && (
        <p className="text-sm text-muted-foreground">파일을 읽는 중…</p>
      )}

      {/* 비밀번호 입력 (잠긴 파일일 때만) */}
      {needsPassword && file && (
        <div className="space-y-2 rounded-md border p-3">
          <Label htmlFor="filepw">파일 비밀번호</Label>
          <div className="flex gap-2">
            <Input
              id="filepw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && password) void readFile(file, password);
              }}
              placeholder="카뱅에서 정한 비번 (보통 생년월일 6자리)"
            />
            <Button
              onClick={() => void readFile(file, password)}
              disabled={!password || reading}
            >
              해독
            </Button>
          </div>
        </div>
      )}

      {status && (
        <div
          className={cn(
            "rounded-md border p-3 text-sm",
            status.kind === "error"
              ? "border-destructive/50 bg-destructive/5 text-destructive"
              : "border-input bg-muted text-muted-foreground",
          )}
        >
          {status.text}
        </div>
      )}

      {drafts && summary && (
        <>
          {/* 요약 */}
          <div className="rounded-md border p-3 text-sm">
            {holder && (
              <div className="mb-2 text-xs text-muted-foreground">
                계좌주: {holder}
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-muted-foreground">지출 (포함)</span>
              <span className="text-right tabular-nums font-medium">
                {formatWon(summary.expenseTotal)} · {summary.includedExpenseCount}
                건
              </span>
              <span className="text-muted-foreground">입금 (포함)</span>
              <span className="text-right tabular-nums font-medium">
                {formatWon(summary.incomeTotal)} · {summary.includedIncomeCount}건
              </span>
              <span className="text-muted-foreground">본인이체 (제외)</span>
              <span className="text-right tabular-nums text-muted-foreground">
                {formatWon(summary.excludedByReason["self-transfer"].total)} ·{" "}
                {summary.excludedByReason["self-transfer"].count}건
              </span>
              <span className="text-muted-foreground">저금통 (제외)</span>
              <span className="text-right tabular-nums text-muted-foreground">
                {formatWon(summary.excludedByReason.savings.total)} ·{" "}
                {summary.excludedByReason.savings.count}건
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              본인이체·저금통은 소비가 아니라 기본 제외돼요. 필요하면 아래에서
              개별로 포함할 수 있어요.
            </p>
          </div>

          {/* 미리보기 */}
          <div className="text-sm text-muted-foreground">
            가져올 거래 {willImport.length}건 / 전체 {marked.length}건
          </div>
          <div className="max-h-96 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-xs">
                <tr>
                  <th className="p-2 text-center">포함</th>
                  <th className="p-2 text-left">날짜</th>
                  <th className="p-2 text-left">내용</th>
                  <th className="p-2 text-right">금액</th>
                  <th className="p-2 text-left">카테고리</th>
                </tr>
              </thead>
              <tbody>
                {marked.slice(0, 200).map(({ draft, duplicate }, i) => {
                  const checked = isChecked(i, draft, duplicate);
                  const isIncome = draft.direction === "income";
                  return (
                    <tr
                      key={i}
                      className={cn(
                        "border-t",
                        !checked && "text-muted-foreground",
                      )}
                    >
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setInclude((s) => ({ ...s, [i]: e.target.checked }))
                          }
                        />
                      </td>
                      <td className="p-2 tabular-nums whitespace-nowrap">
                        {ymd(draft.date)}
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <span>{draft.content || "-"}</span>
                          {isIncome && (
                            <Badge className="bg-emerald-600 text-[10px] hover:bg-emerald-600">
                              입금
                            </Badge>
                          )}
                          {draft.excludeReason && (
                            <Badge variant="secondary" className="text-[10px]">
                              {EXCLUDE_REASON_LABELS_KO[draft.excludeReason]}
                            </Badge>
                          )}
                          {!isIncome && rules[draft.content] && (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/50 text-[10px] text-emerald-600"
                            >
                              학습
                            </Badge>
                          )}
                          {duplicate && (
                            <Badge variant="outline" className="text-[10px]">
                              중복
                            </Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {draft.txType}
                        </div>
                      </td>
                      <td
                        className={cn(
                          "p-2 text-right tabular-nums whitespace-nowrap",
                          isIncome && "text-emerald-600",
                        )}
                      >
                        {isIncome ? "+" : "-"}
                        {formatWon(draft.amount)}
                      </td>
                      <td className="p-2">
                        <select
                          className={selectCls}
                          disabled={isIncome}
                          value={catOverride[i] ?? draft.category}
                          onChange={(e) =>
                            setCatOverride((o) => ({
                              ...o,
                              [i]: e.target.value as Category,
                            }))
                          }
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {CATEGORY_LABELS_KO[c]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {marked.length > 200 && (
            <p className="text-xs text-muted-foreground">
              미리보기는 200건까지만 표시돼요. 가져오기는 전체에 적용됩니다.
            </p>
          )}

          <Button
            onClick={() => {
              const payload = marked
                .map(({ draft }, i) => ({ draft, i, dup: marked[i]!.duplicate }))
                .filter(({ draft, i, dup }) => isChecked(i, draft, dup))
                .map(({ draft, i }) => ({
                  date: ymd(draft.date),
                  amount: draft.amount,
                  category: catOverride[i] ?? draft.category,
                  direction: draft.direction,
                  memo: draft.content || draft.txType,
                  isFixed: false,
                }));
              startTransition(async () => {
                const res = await importTransactions(payload);
                setResult(res);
                setDrafts(null);
                setInclude({});
                setCatOverride({});
              });
            }}
            disabled={pending || willImport.length === 0}
          >
            {pending ? "가져오는 중…" : `${willImport.length}건 가져오기`}
          </Button>
        </>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import {
  buildDrafts,
  markDuplicates,
  parseCsv,
  type CsvColumnMapping,
} from "@/core/csv-import";
import {
  CATEGORIES,
  CATEGORY_LABELS_KO,
  type Category,
} from "@/core/types";
import { importTransactions } from "@/app/actions";
import { formatWon } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const selectCls = cn(
  "h-9 rounded-md border border-input bg-background px-2 text-sm",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

/** 헤더명으로 날짜/금액/가맹점 열을 추측한다. */
function guessMapping(header: string[]): CsvColumnMapping {
  const find = (...keys: string[]) =>
    header.findIndex((h) => keys.some((k) => h.toLowerCase().includes(k)));
  const date = find("날짜", "일자", "date", "거래일", "승인일", "이용일");
  const amount = find("금액", "amount", "이용금액", "승인금액", "결제");
  const merchant = find("가맹점", "내용", "상호", "merchant", "이용하신곳");
  return {
    date: date < 0 ? 0 : date,
    amount: amount < 0 ? 2 : amount,
    merchant: merchant < 0 ? 1 : merchant,
  };
}

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function CsvImportForm() {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<CsvColumnMapping>({
    date: 0,
    amount: 2,
    merchant: 1,
  });
  const [overrides, setOverrides] = useState<Record<number, Category>>({});
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const columnCount = rows
    ? rows.reduce((max, r) => Math.max(max, r.length), 0)
    : 0;
  const header = hasHeader && rows ? (rows[0] ?? []) : [];
  const columnLabel = (i: number) => header[i]?.trim() || `열 ${i + 1}`;

  // 초안 + 중복표시 (mapping·hasHeader가 바뀌면 재계산)
  const drafts = useMemo(
    () => (rows ? buildDrafts(rows, mapping, hasHeader) : []),
    [rows, mapping, hasHeader],
  );
  const marked = useMemo(() => markDuplicates(drafts), [drafts]);
  const newCount = marked.filter((m) => !m.duplicate).length;
  const dupCount = marked.length - newCount;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
    setRows(parsed);
    setHasHeader(true);
    setMapping(guessMapping(parsed[0] ?? []));
    setOverrides({});
    setResult(null);
  }

  function setCol(field: keyof CsvColumnMapping, value: number) {
    setMapping((m) => ({ ...m, [field]: value }));
    setOverrides({});
  }

  function doImport() {
    const payload = marked
      .map((m, i) => ({ ...m, category: overrides[i] ?? m.category }))
      .filter((m) => !m.duplicate)
      .map((m) => ({
        date: ymd(m.date),
        amount: m.amount,
        category: m.category,
        memo: m.merchant,
      }));
    startTransition(async () => {
      const res = await importTransactions(payload);
      setResult(res);
      setRows(null);
      setOverrides({});
    });
  }

  if (result) {
    return (
      <div className="space-y-3 text-sm">
        <p>
          <b>{result.inserted}건</b> 추가, 중복 <b>{result.skipped}건</b> 건너뜀.
        </p>
        <Button variant="outline" onClick={() => setResult(null)}>
          다른 파일 가져오기
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="csv">카드사 명세서 CSV</Label>
        <input
          id="csv"
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
        />
      </div>

      {rows && (
        <>
          {/* 열 매핑 */}
          <div className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">열 지정</span>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={hasHeader} onCheckedChange={setHasHeader} />
                첫 줄은 제목
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["date", "merchant", "amount"] as const).map((field) => (
                <div key={field} className="space-y-1">
                  <Label className="text-xs">
                    {field === "date" ? "날짜" : field === "amount" ? "금액" : "가맹점"}
                  </Label>
                  <select
                    className={selectCls + " w-full"}
                    value={mapping[field]}
                    onChange={(e) => setCol(field, Number(e.target.value))}
                  >
                    {Array.from({ length: columnCount }, (_, i) => (
                      <option key={i} value={i}>
                        {columnLabel(i)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* 미리보기 */}
          <div className="text-sm text-muted-foreground">
            새 거래 {newCount}건 · 중복 {dupCount}건
          </div>
          <div className="max-h-80 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-xs">
                <tr>
                  <th className="p-2 text-left">날짜</th>
                  <th className="p-2 text-left">가맹점</th>
                  <th className="p-2 text-right">금액</th>
                  <th className="p-2 text-left">카테고리</th>
                </tr>
              </thead>
              <tbody>
                {marked.slice(0, 100).map((m, i) => (
                  <tr
                    key={i}
                    className={cn(
                      "border-t",
                      m.duplicate && "text-muted-foreground line-through",
                    )}
                  >
                    <td className="p-2 tabular-nums">{ymd(m.date)}</td>
                    <td className="p-2">
                      {m.merchant || "-"}
                      {m.duplicate && (
                        <Badge variant="secondary" className="ml-2 text-[10px]">
                          중복
                        </Badge>
                      )}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatWon(m.amount)}
                    </td>
                    <td className="p-2">
                      <select
                        className={selectCls}
                        disabled={m.duplicate}
                        value={overrides[i] ?? m.category}
                        onChange={(e) =>
                          setOverrides((o) => ({
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
                ))}
              </tbody>
            </table>
          </div>

          <Button onClick={doImport} disabled={pending || newCount === 0}>
            {pending ? "가져오는 중…" : `${newCount}건 가져오기`}
          </Button>
        </>
      )}
    </div>
  );
}

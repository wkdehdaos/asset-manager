"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Plus, Trash2, X } from "lucide-react";
import {
  extractHoldingsFromImage,
  addHoldingsBatch,
  type ExtractedHolding,
} from "@/app/actions";
import { ASSET_CLASS_META, ASSET_CLASS_ORDER } from "@/lib/portfolio-data";
import { formatWonKorean, parseWon } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** 미리보기에서 편집 가능한 후보 한 건 (금액·수량은 입력 편의상 문자열). */
interface EditRow {
  name: string;
  assetClass: string;
  amount: string;
  ticker: string;
  quantity: string;
}

const selectCls = cn(
  "h-9 rounded-md border border-input bg-background px-2 text-sm",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

/**
 * 업로드 전 캔버스로 축소해 데이터 URL(JPEG)로 변환.
 * 서버 액션 용량 한도(기본 1MB) 회피 + Claude 인식에도 충분한 해상도(≤1568px).
 */
function fileToResizedDataUrl(file: File, maxDim = 1568): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas unsupported"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}

function toEditRow(h: ExtractedHolding): EditRow {
  return {
    name: h.name,
    assetClass: h.assetClass,
    amount: String(h.amount || ""),
    ticker: h.ticker ?? "",
    quantity: h.quantity != null ? String(h.quantity) : "",
  };
}

export function PhotoAdd({
  embedded = false,
  onDone,
}: {
  /** 모달 안에서 쓸 때 true — 바깥 카드 껍데기 없이 내용만 렌더. */
  embedded?: boolean;
  /** 저장 완료 후 호출 (모달 닫기 등). */
  onDone?: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<EditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extracting, startExtract] = useTransition();
  const [saving, startSave] = useTransition();

  function pick() {
    setError(null);
    fileRef.current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 다시 선택해도 onChange 발동하도록 초기화
    if (!file) return;
    setError(null);
    setRows(null);
    startExtract(async () => {
      try {
        const dataUrl = await fileToResizedDataUrl(file);
        const res = await extractHoldingsFromImage(dataUrl);
        if (!res.ok) {
          setError(res.message);
          return;
        }
        setRows(res.holdings.map(toEditRow));
      } catch {
        setError("이미지를 읽지 못했어요. 다른 사진으로 시도해 주세요.");
      }
    });
  }

  function update(i: number, patch: Partial<EditRow>) {
    setRows((prev) =>
      prev ? prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) : prev,
    );
  }

  function removeRow(i: number) {
    setRows((prev) => (prev ? prev.filter((_, idx) => idx !== i) : prev));
  }

  function save() {
    if (!rows) return;
    const payload = rows
      .map((r) => ({
        name: r.name.trim(),
        assetClass: r.assetClass,
        amount: parseWon(r.amount),
        ticker: r.ticker.trim() || undefined,
        quantity: r.quantity.trim() ? Number(r.quantity) : undefined,
      }))
      .filter((r) => r.name && (r.amount > 0 || (r.ticker && r.quantity)));
    if (payload.length === 0) {
      setError("저장할 항목이 없어요. 이름과 금액을 확인해 주세요.");
      return;
    }
    startSave(async () => {
      await addHoldingsBatch(payload);
      setRows(null);
      router.refresh();
      onDone?.();
    });
  }

  const body = (
    <>
      <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onFile}
          className="hidden"
        />

        {!rows && (
          <>
            <button
              type="button"
              onClick={pick}
              disabled={extracting}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input py-8 text-sm text-muted-foreground transition-colors",
                "hover:border-primary/50 hover:text-foreground disabled:opacity-60",
              )}
            >
              {extracting ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" />
                  사진에서 자산을 읽는 중…
                </>
              ) : (
                <>
                  <Camera className="h-6 w-6" />
                  증권사·은행 잔고 화면을 찍거나 선택하세요
                </>
              )}
            </button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              보유종목·평가금액이 보이는 화면일수록 정확해요. 인식 결과는 저장 전에
              직접 확인·수정할 수 있어요.
            </p>
          </>
        )}

        {rows && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                인식된 자산 {rows.length}개
              </span>
              <button
                type="button"
                onClick={() => {
                  setRows(null);
                  setError(null);
                }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
                다시 찍기
              </button>
            </div>

            <ul className="space-y-3">
              {rows.map((r, i) => {
                const won = parseWon(r.amount);
                return (
                  <li
                    key={i}
                    className="space-y-2 rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        value={r.name}
                        onChange={(e) => update(i, { name: e.target.value })}
                        placeholder="종목명"
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="제외"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        className={selectCls + " w-full"}
                        value={r.assetClass}
                        onChange={(e) =>
                          update(i, { assetClass: e.target.value })
                        }
                      >
                        {ASSET_CLASS_ORDER.map((c) => (
                          <option key={c} value={c}>
                            {ASSET_CLASS_META[c].label}
                          </option>
                        ))}
                      </select>
                      <Input
                        inputMode="numeric"
                        value={r.amount}
                        onChange={(e) => update(i, { amount: e.target.value })}
                        placeholder="평가금액(원)"
                      />
                    </div>
                    {won > 0 && (
                      <div className="text-right text-[11px] text-muted-foreground">
                        {formatWonKorean(won)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <Button
              onClick={save}
              disabled={saving}
              className="w-full"
            >
              {saving ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1 h-4 w-4" />
              )}
              {rows.length}개 추가
            </Button>
          </div>
        )}

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </>
  );

  if (embedded) return <div className="space-y-3">{body}</div>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">사진으로 자산 추가</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{body}</CardContent>
    </Card>
  );
}

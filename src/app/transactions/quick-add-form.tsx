"use client";

import { useState, useTransition } from "react";
import { addTransaction } from "@/app/actions";
import { CATEGORIES, CATEGORY_LABELS_KO } from "@/core/types";
import { formatWonKorean, parseWon } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 고정지출로 흔히 잡히는 카테고리는 isFixed 기본 ON을 제안한다. */
const FIXED_BY_DEFAULT = new Set([
  "housing",
  "insurance",
  "subscription",
  "communication",
  "debt",
]);

export function QuickAddForm() {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("dining");
  const [date, setDate] = useState(todayIso());
  const [isFixed, setIsFixed] = useState(false);
  const [memo, setMemo] = useState("");
  const [pending, startTransition] = useTransition();

  const parsed = parseWon(amount);
  const canSubmit = parsed > 0 && !pending;

  function handleCategory(next: string) {
    setCategory(next);
    // 카테고리를 고르면 성격에 맞게 고정 토글을 제안 (사용자가 다시 끌 수 있음)
    setIsFixed(FIXED_BY_DEFAULT.has(next));
  }

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      await addTransaction({ date, amount: parsed, category, isFixed, memo });
      // 다음 입력을 위해 금액·메모만 초기화 (카테고리·날짜는 유지)
      setAmount("");
      setMemo("");
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="amount">금액</Label>
            {parsed > 0 && (
              <span className="text-xs text-muted-foreground">
                {formatWonKorean(parsed)}
              </span>
            )}
          </div>
          <Input
            id="amount"
            inputMode="numeric"
            placeholder="50000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">카테고리</Label>
          <select
            id="category"
            value={category}
            onChange={(e) => handleCategory(e.target.value)}
            className={cn(
              "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS_KO[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="date">날짜</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="memo">메모 (선택)</Label>
          <Input
            id="memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="가맹점 등"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch id="isFixed" checked={isFixed} onCheckedChange={setIsFixed} />
          <Label htmlFor="isFixed" className="cursor-pointer">
            고정지출
          </Label>
          <span className="text-xs text-muted-foreground">
            (월세·보험·구독 등)
          </span>
        </div>
        <Button onClick={submit} disabled={!canSubmit}>
          {pending ? "추가 중…" : "추가"}
        </Button>
      </div>
    </div>
  );
}

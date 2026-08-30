"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  TrendingUp,
  PieChart,
  PiggyBank,
  Landmark,
  Bitcoin,
  Wallet,
  Coins,
  type LucideIcon,
} from "lucide-react";
import { addHolding, deleteHolding, type PortfolioView } from "@/app/actions";
import {
  ASSET_CLASS_META,
  ASSET_CLASS_ORDER,
  assetClassColor,
  assetClassLabel,
} from "@/lib/portfolio-data";
import { formatWon, formatWonKorean, parseWon } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AllocationDonut } from "./allocation-donut";

const selectCls = cn(
  "h-9 rounded-md border border-input bg-background px-2 text-sm",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

/** 자산군별 아이콘. */
const CLASS_ICON: Record<string, LucideIcon> = {
  stock: TrendingUp,
  fund: PieChart,
  savings: PiggyBank,
  bond: Landmark,
  crypto: Bitcoin,
  cash: Wallet,
  other: Coins,
};

/** 색 채운 원 안에 자산군 아이콘 (뱅크샐러드 스타일). */
function ClassIcon({
  assetClass,
  size = "h-9 w-9",
}: {
  assetClass: string;
  size?: string;
}) {
  const Icon = CLASS_ICON[assetClass] ?? Coins;
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full", size)}
      style={{ backgroundColor: assetClassColor(assetClass) }}
    >
      <Icon className="h-4 w-4 text-white" />
    </span>
  );
}

export function PortfolioClient({ view }: { view: PortfolioView }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [assetClass, setAssetClass] = useState<string>("stock");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"class" | "item">("class");
  const [pending, startTransition] = useTransition();

  const amountWon = parseWon(amount);

  // 도넛·범례 데이터 (유형별 / 종목별)
  const donutData =
    mode === "class"
      ? view.slices.map((s) => ({
          name: assetClassLabel(s.assetClass),
          value: s.amount,
          color: assetClassColor(s.assetClass),
        }))
      : view.holdings
          .map((h) => ({
            name: h.name,
            value: h.amount,
            color: assetClassColor(h.assetClass),
            assetClass: h.assetClass,
          }))
          .sort((a, b) => b.value - a.value);

  const legend =
    mode === "class"
      ? view.slices.map((s) => ({
          key: s.assetClass,
          assetClass: s.assetClass,
          label: assetClassLabel(s.assetClass),
          amount: s.amount,
          percent: s.percent,
        }))
      : view.holdings
          .map((h) => ({
            key: h.id,
            assetClass: h.assetClass,
            label: h.name,
            amount: h.amount,
            percent: view.total > 0 ? Math.round((h.amount / view.total) * 100) : 0,
          }))
          .sort((a, b) => b.amount - a.amount);

  function add() {
    if (amountWon <= 0) return;
    startTransition(async () => {
      await addHolding({ name, assetClass, amount: amountWon });
      setName("");
      setAmount("");
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteHolding(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* 총자산 */}
      <Card className="overflow-hidden border-0 shadow-lg shadow-amber-500/10">
        <div className="bg-gradient-to-br from-yellow-300 to-amber-400 p-5 text-neutral-900">
          <div className="text-xs text-neutral-800/70">현재 총자산</div>
          <div className="mt-1 text-3xl font-bold">
            {formatWon(view.total)}
            <span className="ml-1 text-base font-normal text-neutral-800/80">
              원
            </span>
          </div>
          {view.total > 0 && (
            <div className="mt-0.5 text-sm text-neutral-800/70">
              {formatWonKorean(view.total)}
            </div>
          )}
        </div>
      </Card>

      {/* 자산 배분 — 도넛 + 범례 */}
      {view.total > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">자산 배분</CardTitle>
              {/* 유형별 / 종목별 토글 */}
              <div className="inline-flex rounded-full bg-muted p-0.5 text-xs">
                {(
                  [
                    ["class", "유형별"],
                    ["item", "종목별"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      "rounded-full px-3 py-1 transition-colors",
                      mode === m
                        ? "bg-background font-medium shadow-sm"
                        : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center">
              <div className="relative">
                <AllocationDonut data={donutData} />
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold">{legend.length}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {mode === "class" ? "자산군" : "종목"}
                  </span>
                </div>
              </div>

              <ul className="mt-5 w-full space-y-3">
                {legend.map((l) => (
                  <li key={l.key} className="flex items-center gap-3">
                    <ClassIcon assetClass={l.assetClass} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {l.label}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatWon(l.amount)}원
                      </div>
                    </div>
                    <div className="text-sm font-bold tabular-nums">
                      {l.percent}%
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 보유 자산 추가 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">보유 자산 추가</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="h-name" className="text-xs">
                이름
              </Label>
              <Input
                id="h-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 삼성전자, 청년미래적금"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="h-class" className="text-xs">
                자산군
              </Label>
              <select
                id="h-class"
                className={selectCls + " w-full"}
                value={assetClass}
                onChange={(e) => setAssetClass(e.target.value)}
              >
                {ASSET_CLASS_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {ASSET_CLASS_META[c].label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="h-amount" className="text-xs">
                평가금액
              </Label>
              {amountWon > 0 && (
                <span className="text-xs text-muted-foreground">
                  {formatWonKorean(amountWon)}
                </span>
              )}
            </div>
            <Input
              id="h-amount"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="원 단위"
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
            />
          </div>
          <Button
            onClick={add}
            disabled={pending || amountWon <= 0}
            className="w-full"
          >
            <Plus className="mr-1 h-4 w-4" />
            추가
          </Button>
        </CardContent>
      </Card>

      {/* 보유 목록 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            보유 목록{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {view.holdings.length}개
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {view.holdings.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              아직 등록한 자산이 없어요. 위에서 추가하면 비중이 계산됩니다.
            </p>
          ) : (
            <ul className="space-y-1">
              {view.holdings.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center gap-3 rounded-lg px-1 py-2"
                >
                  <ClassIcon assetClass={h.assetClass} size="h-9 w-9" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{h.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {assetClassLabel(h.assetClass)}
                    </div>
                  </div>
                  <span className="tabular-nums text-sm font-semibold">
                    {formatWon(h.amount)}원
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(h.id)}
                    disabled={pending}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

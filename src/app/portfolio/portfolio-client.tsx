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
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import {
  addHolding,
  deleteHolding,
  refreshPrices,
  type PortfolioView,
} from "@/app/actions";
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
import { Switch } from "@/components/ui/switch";
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

/** 실시간 시세 연동이 가능한 자산군 (야후 파이낸스에 시세가 있는 것만). */
const LIVE_CLASSES = new Set(["stock", "fund", "crypto"]);

/** ISO 시각 → "방금 전 / N분 전 / HH:MM" 상대표시. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMin = Math.floor((Date.now() - then) / 60_000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PortfolioClient({ view }: { view: PortfolioView }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [assetClass, setAssetClass] = useState<string>("stock");
  const [amount, setAmount] = useState("");
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [live, setLive] = useState(true);
  const [mode, setMode] = useState<"class" | "item">("class");
  const [pending, startTransition] = useTransition();
  const [refreshing, startRefresh] = useTransition();

  const amountWon = parseWon(amount);
  const liveCapable = LIVE_CLASSES.has(assetClass);
  const useLive = liveCapable && live;
  const qtyNum = Number(quantity);
  const canAdd = useLive
    ? ticker.trim().length > 0 && qtyNum > 0
    : amountWon > 0;

  // 마지막 시세 갱신 시각 — 실시간 종목들 중 가장 최근.
  const lastPricedAt = view.holdings
    .map((h) => h.pricedAt)
    .filter((p): p is string => !!p)
    .sort()
    .at(-1);

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
    if (!canAdd) return;
    startTransition(async () => {
      await addHolding(
        useLive
          ? { name, assetClass, amount: 0, ticker, quantity: qtyNum }
          : { name, assetClass, amount: amountWon },
      );
      setName("");
      setAmount("");
      setTicker("");
      setQuantity("");
      router.refresh();
    });
  }

  function refresh() {
    startRefresh(async () => {
      await refreshPrices();
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
          {view.hasLive && (
            <div className="mt-3 flex items-center justify-between border-t border-neutral-900/10 pt-2.5">
              <span className="text-xs text-neutral-800/70">
                {lastPricedAt
                  ? `시세 ${relativeTime(lastPricedAt)} 기준`
                  : "시세 미갱신"}
              </span>
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                className="inline-flex items-center gap-1 rounded-full bg-neutral-900/10 px-2.5 py-1 text-xs font-medium text-neutral-900 transition-colors hover:bg-neutral-900/20 disabled:opacity-50"
              >
                <RefreshCw
                  className={cn("h-3 w-3", refreshing && "animate-spin")}
                />
                {refreshing ? "갱신 중" : "시세 새로고침"}
              </button>
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
          {liveCapable && (
            <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2">
              <div>
                <div className="text-xs font-medium">실시간 시세 연동</div>
                <div className="text-[11px] text-muted-foreground">
                  티커·수량을 넣으면 자동 평가돼요
                </div>
              </div>
              <Switch checked={live} onCheckedChange={setLive} />
            </div>
          )}

          {useLive ? (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="h-ticker" className="text-xs">
                    티커
                  </Label>
                  <Input
                    id="h-ticker"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value)}
                    placeholder={
                      assetClass === "crypto" ? "예: BTC" : "예: 005930.KS"
                    }
                    autoCapitalize="characters"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") add();
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="h-qty" className="text-xs">
                    수량
                  </Label>
                  <Input
                    id="h-qty"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="주·개"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") add();
                    }}
                  />
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {assetClass === "crypto"
                  ? "야후 심볼 기준 — 비트코인 BTC, 이더리움 ETH (자동으로 -USD 붙임)."
                  : "야후 심볼 기준 — 코스피는 005930.KS, 코스닥은 .KQ, 미국주식은 AAPL."}
              </p>
            </div>
          ) : (
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
          )}
          <Button onClick={add} disabled={pending || !canAdd} className="w-full">
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
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {h.name}
                      </span>
                      {h.ticker && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                          <span className="h-1 w-1 rounded-full bg-emerald-500" />
                          실시간
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {h.ticker
                        ? `${h.ticker} · ${h.quantity ?? 0}${
                            h.assetClass === "crypto" ? "개" : "주"
                          }${
                            h.unitPriceKrw
                              ? ` · ${formatWon(h.unitPriceKrw)}원`
                              : ""
                          }`
                        : assetClassLabel(h.assetClass)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="tabular-nums text-sm font-semibold">
                      {formatWon(h.amount)}원
                    </span>
                    {h.changePct != null && (
                      <span
                        className={cn(
                          "text-[11px] font-medium tabular-nums",
                          h.changePct > 0
                            ? "text-red-600 dark:text-red-400"
                            : h.changePct < 0
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-muted-foreground",
                        )}
                      >
                        {h.changePct > 0 ? "▲" : h.changePct < 0 ? "▼" : ""}
                        {Math.abs(h.changePct)}%
                      </span>
                    )}
                  </div>
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

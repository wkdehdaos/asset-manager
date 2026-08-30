/**
 * 포트폴리오 자산군 정의 — 라벨, 배분 바 색, 배지 색.
 * UI 문자열·스타일은 상수 맵에 모은다 (CLAUDE.md 코드 스타일).
 */

export type AssetClass =
  | "stock"
  | "fund"
  | "savings"
  | "bond"
  | "crypto"
  | "cash"
  | "other";

/** 표시·선택 순서. */
export const ASSET_CLASS_ORDER: AssetClass[] = [
  "stock",
  "fund",
  "savings",
  "bond",
  "crypto",
  "cash",
  "other",
];

// bar: 막대·점(tailwind) / badge: 칩(tailwind) / color: 차트용 hex(=tailwind 500 계열).
export const ASSET_CLASS_META: Record<
  AssetClass,
  { label: string; bar: string; badge: string; color: string }
> = {
  stock: { label: "주식", bar: "bg-rose-500", color: "#f43f5e", badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  fund: { label: "펀드·ETF", bar: "bg-violet-500", color: "#8b5cf6", badge: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  savings: { label: "예적금", bar: "bg-sky-500", color: "#0ea5e9", badge: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  bond: { label: "채권", bar: "bg-emerald-500", color: "#10b981", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  crypto: { label: "가상자산", bar: "bg-amber-500", color: "#f59e0b", badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  cash: { label: "현금·파킹", bar: "bg-slate-400", color: "#94a3b8", badge: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300" },
  other: { label: "기타", bar: "bg-neutral-400", color: "#a3a3a3", badge: "bg-neutral-100 text-neutral-600 dark:bg-neutral-500/15 dark:text-neutral-300" },
};

/** 차트용 색 조회 (알 수 없는 키는 회색). */
export function assetClassColor(key: string): string {
  return ASSET_CLASS_META[key as AssetClass]?.color ?? "#a3a3a3";
}

/** 안전한 라벨 조회 (알 수 없는 키는 그대로 반환). */
export function assetClassLabel(key: string): string {
  return ASSET_CLASS_META[key as AssetClass]?.label ?? key;
}

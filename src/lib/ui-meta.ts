import type { FeasibilityGrade, MonthPace } from "@/core/types";

/** badge.tsx의 신호 색 variant와 1:1 대응. */
export type SignalVariant = "good" | "info" | "warn" | "bad";

/** 실현가능성 등급 → 라벨·색 (UI 문자열은 한 곳에 모은다). */
export const FEASIBILITY_META: Record<
  FeasibilityGrade,
  { label: string; variant: SignalVariant }
> = {
  comfortable: { label: "여유", variant: "good" },
  achievable: { label: "적절", variant: "info" },
  stretch: { label: "공격적", variant: "warn" },
  unrealistic: { label: "조정 필요", variant: "bad" },
};

/** 월중 페이스 신호 → 라벨·색. */
export const PACE_META: Record<
  MonthPace["signal"],
  { label: string; variant: SignalVariant }
> = {
  surplus: { label: "여유", variant: "good" },
  ok: { label: "정상", variant: "info" },
  tight: { label: "긴축", variant: "warn" },
};

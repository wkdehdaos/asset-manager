/**
 * 월별 계획 엔진 — 연도별 12개월의 저축 목표·누적 자산·상태를 계산한다.
 * 계획서(1억 프로젝트)의 단계별 월 저축액을 기준으로 한다.
 *
 * 상태(완료/현재/예정)는 "달력 날짜"가 아니라 **실제 자산이 그 달 목표 누적에
 * 도달했는가**로 판정한다 — PC 시계가 어긋나도 미래 계획이 완료로 잘못 뜨지 않게.
 * 표시 누적도 실제 자산에 앵커링해 현재 시점 = 실제 자산이 되도록 한다.
 *
 * 순수 함수만 (CLAUDE.md 규칙 2). 금액은 원 단위 정수(규칙 3). 현재 시각은 주입.
 */
import type { Won } from "./types";

export const PLAN_START = 202609; // 2026년 9월
export const PLAN_END = 203012; // 2030년 12월
export const PLAN_BASE: Won = 4_000_000; // 계획상 시작 자산 400만

export function ymKey(year: number, month: number): number {
  return year * 100 + month;
}

/** 다음 달 연월(YYYYMM). */
function nextYm(ym: number): number {
  let y = Math.floor(ym / 100);
  let m = (ym % 100) + 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return y * 100 + m;
}

/** 월 저축 목표 재정의 맵 (연월 키 → 금액). AI 은행원/사용자 조정분. */
export type SavingOverrides = Record<number, Won>;

/**
 * 해당 월의 저축 목표액.
 * 재정의(overrides)가 있으면 그 값, 없으면 계획서 단계별 기본값.
 * 입대 전 83만 → 군 복무 105만 → 전역 후 150만. 계획 밖은 0.
 */
export function monthlySaving(ym: number, overrides: SavingOverrides = {}): Won {
  if (overrides[ym] !== undefined) return Math.max(0, Math.round(overrides[ym]!));
  if (ym < PLAN_START) return 0;
  if (ym <= 202702) return 830_000; // 2026.09~2027.02 입대 전
  if (ym <= 202811) return 1_050_000; // 2027.03~2028.11 군 복무
  if (ym <= 203012) return 1_500_000; // 2028.12~2030.12 전역 후
  return 0;
}

/** 계획상 목표 누적 자산 = 시작 자산 + 시작월부터 해당 월까지 저축 목표 합. */
export function cumulativeAt(
  ym: number,
  base: Won = PLAN_BASE,
  overrides: SavingOverrides = {},
): Won {
  if (ym < PLAN_START) return base;
  let total = base;
  let cur = PLAN_START;
  while (cur <= ym) {
    total += monthlySaving(cur, overrides);
    cur = nextYm(cur);
  }
  return total;
}

export type MonthStatus = "done" | "current" | "future";

export interface MonthCell {
  year: number;
  month: number; // 1~12
  ym: number;
  savingTarget: Won;
  /** 표시 누적 — 실제 자산 앵커링(현재 달 = 실제 자산). */
  cumulative: Won;
  status: MonthStatus;
  /** 미래 달 시작일까지 남은 일수(양수일 때만 의미, 아니면 0). */
  dDay: number;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * 한 해(year)의 12개월 셀.
 * 상태(완료/현재/예정)는 **실제 날짜(today)** 기준 — 이번 달=현재, 지난 달=완료, 다음 달=예정.
 * 표시 누적은 **실제 자산(actualAssets)** 에 앵커링 — 이번 달 누적 = 실제 자산.
 * @param actualAssets 실제 포트폴리오 총액.
 * @param today 현재 시각(주입).
 */
export function buildYear(
  year: number,
  actualAssets: Won,
  today: Date,
  overrides: SavingOverrides = {},
): MonthCell[] {
  const curKey = ymKey(today.getFullYear(), today.getMonth() + 1);
  // 이번 달 목표 누적을 기준점으로, 실제 자산에 맞춰 앞뒤로 투영.
  const anchorTarget = cumulativeAt(curKey, PLAN_BASE, overrides);
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const cells: MonthCell[] = [];
  for (let month = 1; month <= 12; month++) {
    const ym = ymKey(year, month);
    const status: MonthStatus =
      ym < curKey ? "done" : ym === curKey ? "current" : "future";

    // 이번 달 누적 = 실제 자산, 나머지는 저축 목표 차이만큼 가감.
    const projected = Math.max(
      0,
      actualAssets + cumulativeAt(ym, PLAN_BASE, overrides) - anchorTarget,
    );

    const dDay =
      status === "future"
        ? Math.max(0, daysBetween(startOfToday, new Date(year, month - 1, 1)))
        : 0;

    cells.push({
      year,
      month,
      ym,
      savingTarget: monthlySaving(ym, overrides),
      cumulative: projected,
      status,
      dDay,
    });
  }
  return cells;
}

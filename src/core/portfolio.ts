/**
 * 포트폴리오 배분 엔진. 보유 자산 목록 → 총액과 자산군별 비중(%).
 * 순수 함수만 (CLAUDE.md 규칙 2). 금액은 원 단위 정수 (규칙 3).
 * 자산군 라벨·색은 lib/portfolio-data.ts에 있고, 여기선 문자열 키로만 다룬다.
 */
import type { Won } from "./types";

/** 보유 자산 한 건 (계산 입력). */
export interface HoldingInput {
  /** 자산군 키 (stock·fund·savings 등). */
  assetClass: string;
  amount: Won;
}

/** 자산군별 배분 한 조각. */
export interface AllocationSlice {
  assetClass: string;
  amount: Won;
  /** 총액 대비 비중(%). 0~100 정수. */
  percent: number;
}

export interface Portfolio {
  total: Won;
  /** 자산군별 합계 — 금액 큰 순. 금액 0인 자산군은 제외. */
  slices: AllocationSlice[];
}

/** 총액 대비 비중(%) — 총액 0이면 0. 반올림 정수. */
function pct(part: Won, total: Won): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

/**
 * 보유 목록을 자산군별로 합산해 총액과 비중을 계산한다.
 * 같은 자산군의 여러 종목은 합쳐진다. 금액 큰 자산군부터 정렬.
 */
export function computePortfolio(holdings: HoldingInput[]): Portfolio {
  const sums = new Map<string, Won>();
  let total = 0;
  for (const h of holdings) {
    const amt = Math.max(0, Math.round(h.amount));
    if (amt === 0) continue;
    sums.set(h.assetClass, (sums.get(h.assetClass) ?? 0) + amt);
    total += amt;
  }

  const slices: AllocationSlice[] = [...sums.entries()]
    .map(([assetClass, amount]) => ({
      assetClass,
      amount,
      percent: pct(amount, total),
    }))
    .sort((a, b) => b.amount - a.amount);

  return { total, slices };
}

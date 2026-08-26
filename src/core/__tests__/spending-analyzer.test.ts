import { describe, expect, it } from "vitest";
import {
  allocateSurplus,
  analyzeMonthPace,
  categoryBaseline,
  countHistoryMonths,
  detectCategoryAnomalies,
  estimateAffordableSaving,
  hasEnoughHistory,
  recurringCategories,
  summarizeMonth,
} from "../spending-analyzer";
import type { Category, Transaction } from "../types";

// ── 더미 거래 생성기 ────────────────────────────────────────────────────────
function tx(
  year: number,
  month: number,
  day: number,
  category: Category,
  amount: number,
  isFixed = false,
): Transaction {
  return { date: new Date(year, month - 1, day), amount, category, isFixed };
}

/**
 * 최근 7개월(2026-01 ~ 2026-07)의 더미 거래.
 * - 통신 55,000원: 매달 5일 1건 (반복결제, isFixed=false로 일부러 둠 → 함정 1 검증)
 * - 보험 120,000원: 매달 3일 1건 (반복결제)
 * - 외식: 매달 여러 건 분산, 합계 ~200,000원
 * - 식료품: 매달 여러 건 분산, 합계 ~300,000원
 */
function buildHistory(): Transaction[] {
  const out: Transaction[] = [];
  for (let m = 1; m <= 7; m++) {
    out.push(tx(2026, m, 5, "communication", 55_000)); // isFixed 안 붙임
    out.push(tx(2026, m, 3, "insurance", 120_000));
    // 외식: 4건 분산 = 200,000
    out.push(tx(2026, m, 6, "dining", 50_000));
    out.push(tx(2026, m, 13, "dining", 50_000));
    out.push(tx(2026, m, 20, "dining", 50_000));
    out.push(tx(2026, m, 27, "dining", 50_000));
    // 식료품: 3건 분산 = 300,000
    out.push(tx(2026, m, 8, "food", 100_000));
    out.push(tx(2026, m, 16, "food", 100_000));
    out.push(tx(2026, m, 24, "food", 100_000));
  }
  return out;
}

describe("summarizeMonth", () => {
  it("고정/변동을 분리하고 카테고리별로 합산한다", () => {
    const s = summarizeMonth(buildHistory(), 2026, 1);
    expect(s.byCategory.communication).toBe(55_000);
    expect(s.byCategory.dining).toBe(200_000);
    expect(s.byCategory.food).toBe(300_000);
    expect(s.countByCategory.dining).toBe(4);
    expect(s.countByCategory.communication).toBe(1);
    expect(s.total).toBe(55_000 + 120_000 + 200_000 + 300_000);
  });
});

describe("categoryBaseline — 중앙값 기준선", () => {
  it("매달 동일한 통신·보험은 그 값이 그대로 중앙값", () => {
    const base = categoryBaseline(buildHistory(), new Date(2026, 7, 10), 6);
    expect(base.communication).toBe(55_000);
    expect(base.insurance).toBe(120_000);
    expect(base.dining).toBe(200_000);
  });
});

describe("recurringCategories — 함정 1: 반복결제 식별", () => {
  it("통신·보험은 매달 1건이라 반복결제로 잡힌다 (isFixed 없이도)", () => {
    const set = recurringCategories(buildHistory(), new Date(2026, 7, 10), 6);
    expect(set.has("communication")).toBe(true);
    expect(set.has("insurance")).toBe(true);
  });
  it("여러 건 분산되는 외식·식료품은 반복결제가 아니다", () => {
    const set = recurringCategories(buildHistory(), new Date(2026, 7, 10), 6);
    expect(set.has("dining")).toBe(false);
    expect(set.has("food")).toBe(false);
  });
});

describe("analyzeMonthPace — 함정 1: 월초 반복결제를 외삽하지 않는다", () => {
  // 2026-08-10 (10일차, 총 31일). 통신·보험은 이미 결제됨(월초).
  // 외식·식료품은 아직 일부만 지출.
  const today = new Date(2026, 7, 10);
  const current: Transaction[] = [
    tx(2026, 8, 3, "insurance", 120_000), // 반복결제 (월초)
    tx(2026, 8, 5, "communication", 55_000), // 반복결제 (월초)
    tx(2026, 8, 6, "dining", 50_000), // 변동
    tx(2026, 8, 8, "food", 100_000), // 변동
  ];

  it("통신·보험은 외삽되지 않아 예상 고정지출이 부풀지 않는다", () => {
    const pace = analyzeMonthPace({
      transactions: [...buildHistory(), ...current],
      monthlyBudget: 800_000,
      today,
    });
    // 고정지출(통신+보험=175,000)이 10일차 경과비율(약 0.32)로 나뉘어
    // 540,000원 따위로 뻥튀기되면 안 된다.
    expect(pace.projectedFixed).toBe(175_000);
  });

  it("변동지출(외식·식료품)만 경과비율로 외삽된다", () => {
    const pace = analyzeMonthPace({
      transactions: [...buildHistory(), ...current],
      monthlyBudget: 800_000,
      today,
    });
    // 변동 150,000 / (10/31) ≈ 465,000
    const expected = Math.round(150_000 / (10 / 31));
    expect(pace.projectedVariable).toBe(expected);
    expect(pace.projectedTotal).toBe(175_000 + expected);
  });
});

describe("analyzeMonthPace — 신호 판정", () => {
  const today = new Date(2026, 7, 15); // 15일차/31일
  const base = buildHistory();

  it("예상 지출이 예산을 넘으면 tight", () => {
    const current = [tx(2026, 8, 5, "dining", 400_000)];
    const pace = analyzeMonthPace({
      transactions: [...base, ...current],
      monthlyBudget: 300_000,
      today,
    });
    expect(pace.signal).toBe("tight");
  });

  it("여유로우면 surplus", () => {
    const current = [tx(2026, 8, 5, "dining", 10_000)];
    const pace = analyzeMonthPace({
      transactions: [...base, ...current],
      monthlyBudget: 2_000_000,
      today,
    });
    expect(pace.signal).toBe("surplus");
  });
});

describe("analyzeMonthPace — 함정 2: 예산 초과 시 하루 한도 대신 초과 금액", () => {
  const today = new Date(2026, 7, 20); // 20일차
  it("이미 변동 예산을 초과하면 dailyLimit=null, overAmount>0, 초과 문구", () => {
    const current = [tx(2026, 8, 5, "dining", 900_000)]; // 예산 대비 대폭 초과
    const pace = analyzeMonthPace({
      transactions: [...buildHistory(), ...current],
      monthlyBudget: 500_000,
      today,
    });
    expect(pace.overBudget).toBe(true);
    expect(pace.dailyLimit).toBeNull();
    expect(pace.overAmount).toBeGreaterThan(0);
    expect(pace.message).toContain("초과");
    expect(pace.message).not.toContain("하루 0");
  });

  it("정상 범위면 dailyLimit이 양수로 나온다", () => {
    const current = [tx(2026, 8, 5, "dining", 50_000)];
    const pace = analyzeMonthPace({
      transactions: [...buildHistory(), ...current],
      monthlyBudget: 1_500_000,
      today,
    });
    expect(pace.overBudget).toBe(false);
    expect(pace.dailyLimit).not.toBeNull();
    expect(pace.dailyLimit!).toBeGreaterThan(0);
  });
});

describe("detectCategoryAnomalies — STEP 2 핵심 시나리오", () => {
  // 이번 달(2026-08)만 외식비가 2배(400,000). 통신·보험은 평소와 동일.
  const today = new Date(2026, 7, 28);
  const current: Transaction[] = [
    tx(2026, 8, 3, "insurance", 120_000), // 평소와 동일
    tx(2026, 8, 5, "communication", 55_000), // 평소와 동일
    tx(2026, 8, 6, "dining", 100_000),
    tx(2026, 8, 13, "dining", 100_000),
    tx(2026, 8, 20, "dining", 100_000),
    tx(2026, 8, 27, "dining", 100_000), // 외식 합계 400,000 = 평소의 2배
    tx(2026, 8, 8, "food", 100_000),
    tx(2026, 8, 16, "food", 100_000),
    tx(2026, 8, 24, "food", 100_000), // 식료품 300,000 = 평소와 동일
  ];

  it("외식만 알림에 뜨고 통신·보험은 뜨지 않는다", () => {
    const anomalies = detectCategoryAnomalies(
      [...buildHistory(), ...current],
      today,
      6,
    );
    const categories = anomalies.map((a) => a.category);
    expect(categories).toContain("dining");
    expect(categories).not.toContain("communication");
    expect(categories).not.toContain("insurance");
    expect(categories).not.toContain("food");
  });

  it("외식 알림 문구에 '많습니다'와 편차율이 담긴다", () => {
    const anomalies = detectCategoryAnomalies(
      [...buildHistory(), ...current],
      today,
      6,
    );
    const dining = anomalies.find((a) => a.category === "dining")!;
    expect(dining.baseline).toBe(200_000);
    expect(dining.current).toBe(400_000);
    expect(dining.deviationAmount).toBe(200_000);
    expect(dining.message).toContain("100%");
    expect(dining.message).toContain("많습니다");
  });

  it("상위 5개까지만 노출한다", () => {
    const anomalies = detectCategoryAnomalies(
      [...buildHistory(), ...current],
      today,
      6,
    );
    expect(anomalies.length).toBeLessThanOrEqual(5);
  });
});

describe("countHistoryMonths / hasEnoughHistory — 함정 4", () => {
  const today = new Date(2026, 7, 15); // 2026-08

  it("이번 달 이전의 서로 다른 달 수를 센다", () => {
    const txs = [
      tx(2026, 8, 1, "food", 10_000), // 이번 달 — 제외
      tx(2026, 7, 1, "food", 10_000),
      tx(2026, 6, 1, "food", 10_000),
      tx(2026, 6, 15, "dining", 10_000), // 같은 달 중복 — 1로 카운트
    ];
    expect(countHistoryMonths(txs, today)).toBe(2);
  });

  it("이력 3개월 미만이면 분석 보류", () => {
    const two = [
      tx(2026, 7, 1, "food", 10_000),
      tx(2026, 6, 1, "food", 10_000),
    ];
    expect(hasEnoughHistory(two, today)).toBe(false);
  });

  it("이력 3개월 이상이면 분석 시작", () => {
    expect(hasEnoughHistory(buildHistory(), today)).toBe(true);
  });
});

describe("estimateAffordableSaving / allocateSurplus", () => {
  it("소득에서 예상 지출을 빼 저축 가능액을 낸다(음수는 0)", () => {
    const today = new Date(2026, 7, 15);
    const pace = analyzeMonthPace({
      transactions: buildHistory(),
      monthlyBudget: 1_000_000,
      today,
    });
    const saving = estimateAffordableSaving(3_000_000, pace);
    expect(saving).toBe(Math.max(0, 3_000_000 - pace.projectedTotal));
  });

  it("여유분을 비상금 부족분 우선 → 나머지 목표60/투자40으로 배분", () => {
    const a = allocateSurplus(1_000_000, 400_000);
    expect(a.toEmergency).toBe(400_000);
    expect(a.toGoal).toBe(360_000); // 600,000 * 0.6
    expect(a.toInvestment).toBe(240_000); // 나머지
    expect(a.toEmergency + a.toGoal + a.toInvestment).toBe(1_000_000);
  });

  it("비상금이 이미 충분하면 전액 목표60/투자40", () => {
    const a = allocateSurplus(500_000, 0);
    expect(a.toEmergency).toBe(0);
    expect(a.toGoal).toBe(300_000);
    expect(a.toInvestment).toBe(200_000);
  });
});

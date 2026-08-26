import { describe, expect, it } from "vitest";
import { generateFallbackSummary, type CoachFacts } from "../ai-coach";

function baseFacts(over: Partial<CoachFacts> = {}): CoachFacts {
  return {
    goalTitle: "3년 내 1억",
    months: 28,
    requiredMonthlySavingWon: 2_621_603,
    monthlySavingCapacityWon: 1_700_000,
    monthlyShortfallWon: 921_603,
    onTrack: false,
    feasibilityGrade: "unrealistic",
    requiredReturnPct: 28.5,
    reachableBySavingAlone: false,
    pace: {
      signal: "tight",
      projectedTotalWon: 1_800_000,
      budgetWon: 1_600_000,
      overBudget: true,
      overAmountWon: 95_000,
    },
    anomalies: [{ label: "외식", direction: "over", deviationPct: 100 }],
    investment: {
      profileLabel: "보수",
      allocation: { safe: 40, bonds: 30, stocks: 30 },
      emergencyFunded: true,
      monthlyInvestmentWon: 1_700_000,
    },
    preservation: [
      { label: "물가상승률", status: "growing", realReturnPct: 1 },
      { label: "기준금리", status: "growing", realReturnPct: 0.5 },
    ],
    ...over,
  };
}

describe("generateFallbackSummary — 규칙 기반 폴백 (AI 없이 동작)", () => {
  it("400자 이내로 요약한다", () => {
    const text = generateFallbackSummary(baseFacts());
    expect(text.length).toBeLessThanOrEqual(400);
    expect(text.length).toBeGreaterThan(0);
  });

  it("투자를 언급하면 원금 손실 가능성을 함께 알린다 (가드레일)", () => {
    const text = generateFallbackSummary(baseFacts());
    expect(text).toContain("원금 손실");
  });

  it("특정 상품·종목·코인을 언급하지 않는다", () => {
    const text = generateFallbackSummary(baseFacts());
    for (const banned of ["삼성", "비트코인", "ETF", "펀드", "코인", "테슬라"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("예산 초과 시 다그치지 않고 다음 행동을 제시한다 (함정 2 톤)", () => {
    const text = generateFallbackSummary(baseFacts());
    expect(text).toContain("초과");
    expect(text).toContain("다음 달");
    expect(text).not.toContain("낭비");
  });

  it("저축만으로 초과 달성이면 그 사실을 알린다 (함정 3)", () => {
    const text = generateFallbackSummary(
      baseFacts({
        onTrack: true,
        reachableBySavingAlone: true,
        feasibilityGrade: "comfortable",
      }),
    );
    expect(text).toContain("목표");
  });

  it("비상금 미달이면 투자보다 비상금 확보를 먼저 권한다", () => {
    const text = generateFallbackSummary(
      baseFacts({
        investment: {
          profileLabel: "보수",
          allocation: { safe: 40, bonds: 30, stocks: 30 },
          emergencyFunded: false,
          monthlyInvestmentWon: 300_000,
        },
      }),
    );
    expect(text).toContain("비상금");
    expect(text).toContain("원금 손실");
  });

  it("이력이 없어 pace/investment가 null이어도 동작한다", () => {
    const text = generateFallbackSummary(
      baseFacts({ pace: null, investment: null, anomalies: [] }),
    );
    expect(text.length).toBeGreaterThan(0);
    expect(text.length).toBeLessThanOrEqual(400);
  });
});

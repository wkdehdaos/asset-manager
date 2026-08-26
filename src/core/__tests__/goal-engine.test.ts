import { describe, expect, it } from "vitest";
import {
  diagnoseGoal,
  futureValue,
  judgeFeasibility,
  monthsBetween,
  monthsToReachGoal,
  requiredMonthlySaving,
  solveRequiredAnnualReturn,
  suggestAlternatives,
  toMonthlyRate,
} from "../goal-engine";
import type { GoalInput } from "../types";

const 억 = 100_000_000;
const 천만 = 10_000_000;

describe("toMonthlyRate", () => {
  it("연 3%의 월수익률을 12번 복리하면 다시 연 3%가 된다", () => {
    const r = toMonthlyRate(0.03);
    expect(Math.pow(1 + r, 12) - 1).toBeCloseTo(0.03, 10);
  });

  it("연 0%면 월수익률도 0", () => {
    expect(toMonthlyRate(0)).toBe(0);
  });
});

describe("requiredMonthlySaving — SPEC §5-1 검증값", () => {
  it("1억 / 36개월 / 현재 0 / 연 3% → 2,659,711원", () => {
    expect(requiredMonthlySaving(억, 0, 0.03, 36)).toBe(2_659_711);
  });

  it("1억 / 36개월 / 현재 2천만 / 연 3% → 2,078,443원", () => {
    expect(requiredMonthlySaving(억, 2 * 천만, 0.03, 36)).toBe(2_078_443);
  });

  it("1억 / 36개월 / 현재 0 / 연 0% → 2,777,778원", () => {
    expect(requiredMonthlySaving(억, 0, 0, 36)).toBe(2_777_778);
  });
});

describe("futureValue ↔ requiredMonthlySaving 왕복 일관성", () => {
  it("필요 월저축액으로 저축하면 목표액에 도달한다", () => {
    const pmt = requiredMonthlySaving(억, 0, 0.03, 36);
    expect(futureValue(0, pmt, 0.03, 36)).toBeCloseTo(억, -2); // 반올림 오차 허용
  });

  it("r ≈ 0 분기: 연 0%면 단순 합산", () => {
    expect(futureValue(0, 1_000_000, 0, 36)).toBe(36_000_000);
    expect(futureValue(5_000_000, 1_000_000, 0, 36)).toBe(41_000_000);
  });
});

describe("solveRequiredAnnualReturn — SPEC §5-2 검증값", () => {
  it("월 200만 / 36개월 / 목표 1억 / 현재 0 → 23.81%", () => {
    const r = solveRequiredAnnualReturn(억, 0, 2_000_000, 36);
    expect(r).not.toBeNull();
    expect(r! * 100).toBeCloseTo(23.81, 1);
  });

  it("상한으로도 도달 불가하면 null", () => {
    // 월 1만원, 1개월, 목표 1억 — 어떤 수익률로도 불가능
    expect(solveRequiredAnnualReturn(억, 0, 10_000, 1)).toBeNull();
  });

  it("저축만으로 초과 달성이면 음수 수익률을 반환 (함정 3)", () => {
    // 월 400만 × 36개월 = 1.44억 > 목표 1억 → 음수 필요수익률
    const r = solveRequiredAnnualReturn(억, 0, 4_000_000, 36);
    expect(r).not.toBeNull();
    expect(r!).toBeLessThan(0);
  });
});

describe("judgeFeasibility — SPEC §5-2 등급표 + 함정 3", () => {
  it("≤4% comfortable", () => {
    expect(judgeFeasibility(0.03).grade).toBe("comfortable");
  });
  it("≤8% achievable", () => {
    expect(judgeFeasibility(0.07).grade).toBe("achievable");
  });
  it("≤15% stretch — 원금 손실 가능성 문구 포함", () => {
    const f = judgeFeasibility(0.12);
    expect(f.grade).toBe("stretch");
    expect(f.message).toContain("원금 손실");
  });
  it(">15% unrealistic", () => {
    expect(judgeFeasibility(0.2381).grade).toBe("unrealistic");
  });
  it("null → unrealistic (도달 불가)", () => {
    expect(judgeFeasibility(null).grade).toBe("unrealistic");
  });
  it("음수 → comfortable + '저축만으로' 문구 (함정 3)", () => {
    const f = judgeFeasibility(-0.09);
    expect(f.grade).toBe("comfortable");
    expect(f.reachableBySavingAlone).toBe(true);
    expect(f.message).toContain("저축만으로");
  });
});

describe("monthsBetween", () => {
  it("정확히 36개월", () => {
    expect(
      monthsBetween(new Date("2026-01-01"), new Date("2029-01-01")),
    ).toBe(36);
  });
  it("기한 일이 시작 일보다 이르면 한 달 덜 센다", () => {
    expect(
      monthsBetween(new Date("2026-01-15"), new Date("2026-02-10")),
    ).toBe(0);
  });
  it("과거 날짜면 0으로 하한 처리", () => {
    expect(
      monthsBetween(new Date("2026-06-01"), new Date("2026-01-01")),
    ).toBe(0);
  });
});

describe("monthsToReachGoal", () => {
  it("이미 목표 이상이면 0개월", () => {
    expect(monthsToReachGoal(억, 억, 0, 0.03)).toBe(0);
  });
  it("저축 0 & 수익률 0이면 영원히 도달 불가 → null", () => {
    expect(monthsToReachGoal(억, 0, 0, 0)).toBeNull();
  });
  it("월 200만 / 연 3% / 목표 1억이면 36개월보다 조금 더 걸린다", () => {
    const n = monthsToReachGoal(억, 0, 2_000_000, 0.03);
    expect(n).not.toBeNull();
    expect(n!).toBeGreaterThan(36);
  });
});

describe("diagnoseGoal — 종합 진단", () => {
  const goal: GoalInput = {
    targetAmount: 억,
    targetDate: new Date("2029-01-01"),
    currentAssets: 0,
    expectedAnnualReturn: 0.03,
  };
  const today = new Date("2026-01-01");

  it("필요 월저축액과 부족분을 계산한다", () => {
    const d = diagnoseGoal(goal, 2_000_000, today);
    expect(d.months).toBe(36);
    expect(d.requiredMonthlySaving).toBe(2_659_711);
    expect(d.monthlyShortfall).toBe(659_711);
    expect(d.onTrack).toBe(false);
    expect(d.feasibility.grade).toBe("unrealistic"); // 월 200만으론 23.81% 필요
  });

  it("저축 여력이 충분하면 onTrack", () => {
    const d = diagnoseGoal(goal, 3_000_000, today);
    expect(d.onTrack).toBe(true);
    expect(d.monthlyShortfall).toBeLessThan(0);
  });
});

describe("suggestAlternatives — 3가지 대안", () => {
  const goal: GoalInput = {
    targetAmount: 억,
    targetDate: new Date("2029-01-01"),
    currentAssets: 0,
    expectedAnnualReturn: 0.03,
  };
  const today = new Date("2026-01-01");

  it("기한연장·목표축소·저축증액을 모두 제시한다", () => {
    const alt = suggestAlternatives(goal, 2_000_000, today);

    // 기한 연장: 36개월보다 더 걸린다
    expect(alt.extendDeadline.months).toBeGreaterThan(36);
    expect(alt.extendDeadline.newTargetDate).toBeInstanceOf(Date);

    // 목표 축소: 1억보다 작은 달성 가능액
    expect(alt.reduceTarget.achievableAmount).toBeLessThan(억);
    expect(alt.reduceTarget.achievableAmount).toBeGreaterThan(0);

    // 저축 증액: 필요액과 추가 부담분
    expect(alt.increaseSaving.requiredMonthlySaving).toBe(2_659_711);
    expect(alt.increaseSaving.additionalPerMonth).toBe(659_711);
  });
});

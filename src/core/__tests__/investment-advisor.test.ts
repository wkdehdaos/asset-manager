import { describe, expect, it } from "vitest";
import {
  calculateInvestmentCapacity,
  isReturnAchievable,
  riskProfileFor,
} from "../investment-advisor";

describe("riskProfileFor — SPEC §5-5 기간별 성향표", () => {
  it("< 12개월: 원금보존 100/0/0", () => {
    const p = riskProfileFor(6);
    expect(p.key).toBe("preservation");
    expect(p.allocation).toEqual({ safe: 100, bonds: 0, stocks: 0 });
  });
  it("12~36개월: 보수 40/30/30", () => {
    expect(riskProfileFor(12).key).toBe("conservative");
    expect(riskProfileFor(35).allocation).toEqual({ safe: 40, bonds: 30, stocks: 30 });
  });
  it("36~84개월: 중립 15/30/55", () => {
    expect(riskProfileFor(36).key).toBe("neutral");
    expect(riskProfileFor(83).allocation).toEqual({ safe: 15, bonds: 30, stocks: 55 });
  });
  it("≥ 84개월: 성장 5/15/80", () => {
    expect(riskProfileFor(84).key).toBe("growth");
    expect(riskProfileFor(120).allocation).toEqual({ safe: 5, bonds: 15, stocks: 80 });
  });
  it("모든 배분의 합은 100", () => {
    for (const m of [6, 24, 60, 120]) {
      const a = riskProfileFor(m).allocation;
      expect(a.safe + a.bonds + a.stocks).toBe(100);
    }
  });
});

describe("calculateInvestmentCapacity — 비상금 충족", () => {
  const cap = calculateInvestmentCapacity({
    liquidAssets: 30_000_000,
    monthlyFixedExpense: 2_000_000,
    monthlySaving: 1_000_000,
    remainingMonths: 60,
  });

  it("비상금 목표 = 월 고정 × 4개월, 투자가능액 = 유동 − 비상금", () => {
    expect(cap.emergencyTarget).toBe(8_000_000);
    expect(cap.emergencyFunded).toBe(true);
    expect(cap.emergencyShortfall).toBe(0);
    expect(cap.investableAssets).toBe(22_000_000);
  });

  it("충족 시 월 저축 전액을 투자에 배정 가능", () => {
    expect(cap.monthlyInvestment).toBe(1_000_000);
  });

  it("원금 손실 가능성·참고 정보 고지를 포함한다", () => {
    expect(cap.warnings.some((w) => w.includes("원금 손실"))).toBe(true);
    expect(cap.warnings.some((w) => w.includes("투자 권유가 아닙"))).toBe(true);
  });
});

describe("calculateInvestmentCapacity — 비상금 미달", () => {
  const cap = calculateInvestmentCapacity({
    liquidAssets: 5_000_000,
    monthlyFixedExpense: 2_000_000,
    monthlySaving: 1_000_000,
    remainingMonths: 60,
  });

  it("미달이면 투자가능액 0, 월 저축의 30%만 배정", () => {
    expect(cap.emergencyShortfall).toBe(3_000_000);
    expect(cap.emergencyFunded).toBe(false);
    expect(cap.investableAssets).toBe(0);
    expect(cap.monthlyInvestment).toBe(300_000);
  });

  it("비상금 부족 경고 문구를 포함한다", () => {
    expect(cap.warnings.some((w) => w.includes("비상금"))).toBe(true);
    expect(cap.warnings.some((w) => w.includes("30%"))).toBe(true);
  });
});

describe("calculateInvestmentCapacity — 비상금 개월 수 clamp(3~6)", () => {
  it("범위를 벗어난 값은 3~6으로 제한", () => {
    const lo = calculateInvestmentCapacity({
      liquidAssets: 0,
      monthlyFixedExpense: 1_000_000,
      monthlySaving: 0,
      remainingMonths: 60,
      emergencyMonths: 1,
    });
    const hi = calculateInvestmentCapacity({
      liquidAssets: 0,
      monthlyFixedExpense: 1_000_000,
      monthlySaving: 0,
      remainingMonths: 60,
      emergencyMonths: 12,
    });
    expect(lo.emergencyTarget).toBe(3_000_000);
    expect(hi.emergencyTarget).toBe(6_000_000);
  });
});

describe("가드레일 — 특정 상품·종목을 언급하지 않는다", () => {
  it("경고 문구에 상품·종목·코인명이 없다", () => {
    const cap = calculateInvestmentCapacity({
      liquidAssets: 30_000_000,
      monthlyFixedExpense: 2_000_000,
      monthlySaving: 1_000_000,
      remainingMonths: 120,
    });
    const joined = cap.warnings.join(" ") + " " + cap.profile.note;
    // 흔한 상품·종목·코인 키워드가 등장하면 안 된다
    for (const banned of ["삼성", "비트코인", "ETF", "펀드", "테슬라", "코인"]) {
      expect(joined).not.toContain(banned);
    }
  });
});

describe("isReturnAchievable — 성향으로 감당 가능한지", () => {
  const neutral = riskProfileFor(60);
  const conservative = riskProfileFor(24);

  it("중립 성향으로 5%는 감당 가능", () => {
    const v = isReturnAchievable(0.05, neutral);
    expect(v.achievable).toBe(true);
    expect(v.message).toContain("원금 손실");
  });
  it("보수 성향으로 11%는 감당 불가", () => {
    expect(isReturnAchievable(0.11, conservative).achievable).toBe(false);
  });
  it("도달 불가(null)면 감당 불가 + 목표 조정 안내", () => {
    const v = isReturnAchievable(null, neutral);
    expect(v.achievable).toBe(false);
    expect(v.message).toContain("목표 조정");
  });
  it("음수 필요수익률이면 투자 없이도 달성 가능", () => {
    const v = isReturnAchievable(-0.09, conservative);
    expect(v.achievable).toBe(true);
    expect(v.message).toContain("저축만으로");
  });
});

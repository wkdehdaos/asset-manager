import { describe, expect, it } from "vitest";
import { computePortfolio } from "../portfolio";

describe("computePortfolio", () => {
  it("총액과 자산군별 비중을 계산한다", () => {
    const p = computePortfolio([
      { assetClass: "stock", amount: 5_000_000 },
      { assetClass: "savings", amount: 3_000_000 },
      { assetClass: "cash", amount: 2_000_000 },
    ]);
    expect(p.total).toBe(10_000_000);
    const byClass = Object.fromEntries(p.slices.map((s) => [s.assetClass, s]));
    expect(byClass.stock!.percent).toBe(50);
    expect(byClass.savings!.percent).toBe(30);
    expect(byClass.cash!.percent).toBe(20);
  });

  it("같은 자산군의 여러 종목을 합산한다", () => {
    const p = computePortfolio([
      { assetClass: "stock", amount: 1_000_000 },
      { assetClass: "stock", amount: 2_000_000 },
    ]);
    expect(p.slices).toHaveLength(1);
    expect(p.slices[0]!.amount).toBe(3_000_000);
    expect(p.slices[0]!.percent).toBe(100);
  });

  it("금액 큰 자산군부터 정렬한다", () => {
    const p = computePortfolio([
      { assetClass: "cash", amount: 1_000_000 },
      { assetClass: "stock", amount: 4_000_000 },
      { assetClass: "bond", amount: 2_000_000 },
    ]);
    expect(p.slices.map((s) => s.assetClass)).toEqual(["stock", "bond", "cash"]);
  });

  it("금액 0·음수는 제외한다", () => {
    const p = computePortfolio([
      { assetClass: "stock", amount: 1_000_000 },
      { assetClass: "cash", amount: 0 },
      { assetClass: "bond", amount: -500 },
    ]);
    expect(p.slices).toHaveLength(1);
    expect(p.total).toBe(1_000_000);
  });

  it("빈 목록이면 총액 0, 조각 없음", () => {
    const p = computePortfolio([]);
    expect(p.total).toBe(0);
    expect(p.slices).toEqual([]);
  });
});

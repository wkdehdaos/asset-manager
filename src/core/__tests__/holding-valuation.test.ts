import { describe, it, expect } from "vitest";
import { marketValueKrw, dailyChangePct } from "../holding-valuation";

describe("marketValueKrw", () => {
  it("KRW 종목: 수량 × 시세 (환율 1)", () => {
    // 삼성전자 10주 × 70,000원
    expect(marketValueKrw(10, 70_000, 1)).toBe(700_000);
  });

  it("USD 종목: 환율로 원화 환산", () => {
    // 애플 5주 × $150 × 1,350원/$ = 1,012,500원
    expect(marketValueKrw(5, 150, 1_350)).toBe(1_012_500);
  });

  it("소수 수량(암호화폐)도 처리한다", () => {
    // BTC 0.5개 × $60,000 × 1,350원/$ = 40,500,000원
    expect(marketValueKrw(0.5, 60_000, 1_350)).toBe(40_500_000);
  });

  it("결과는 원 단위 정수로 반올림한다", () => {
    // 3 × 33.333 × 1 = 99.999 → 100
    expect(marketValueKrw(3, 33.333, 1)).toBe(100);
  });

  it("음수·0·비정상 입력은 0을 반환한다", () => {
    expect(marketValueKrw(-1, 70_000, 1)).toBe(0);
    expect(marketValueKrw(10, 0, 1)).toBe(0);
    expect(marketValueKrw(10, 70_000, 0)).toBe(0);
    expect(marketValueKrw(NaN, 70_000, 1)).toBe(0);
    expect(marketValueKrw(10, Infinity, 1)).toBe(0);
  });
});

describe("dailyChangePct", () => {
  it("상승: 삼성전자 261,000 vs 전일 260,000 → +0.38%", () => {
    expect(dailyChangePct(261_000, 260_000)).toBe(0.38);
  });

  it("하락: 애플 316.85 vs 전일 319.7 → -0.89%", () => {
    expect(dailyChangePct(316.85, 319.7)).toBe(-0.89);
  });

  it("보합: 같은 값이면 0", () => {
    expect(dailyChangePct(100, 100)).toBe(0);
  });

  it("전일종가 없음·0·비정상이면 null", () => {
    expect(dailyChangePct(100, null)).toBeNull();
    expect(dailyChangePct(100, 0)).toBeNull();
    expect(dailyChangePct(NaN, 100)).toBeNull();
  });
});

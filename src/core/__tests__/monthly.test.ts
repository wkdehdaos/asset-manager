import { describe, expect, it } from "vitest";
import { buildYear, cumulativeAt, monthlySaving, PLAN_BASE } from "../monthly";

const TODAY = new Date(2026, 7, 15); // 2026-08-15 (실제 이번 달 = 8월)

describe("monthlySaving — 단계별 월 저축액", () => {
  it("시작 전 0 / 입대 전 83만 / 군 105만 / 전역 후 150만", () => {
    expect(monthlySaving(202608)).toBe(0);
    expect(monthlySaving(202609)).toBe(830_000);
    expect(monthlySaving(202703)).toBe(1_050_000);
    expect(monthlySaving(202812)).toBe(1_500_000);
  });
});

describe("cumulativeAt — 목표 누적", () => {
  it("시작월 = 시작자산 + 83만", () => {
    expect(cumulativeAt(202609)).toBe(PLAN_BASE + 830_000);
  });
  it("연도 경계를 넘겨 누적", () => {
    expect(cumulativeAt(202701)).toBe(PLAN_BASE + 830_000 * 5);
  });
});

describe("buildYear — 실제 날짜 기준 상태 + 자산 기준 누적", () => {
  const assets = 5_240_000; // 실제 자산 524만

  it("이번 달(8월)=현재, 지난 달=완료, 다음 달=예정", () => {
    const cells = buildYear(2026, assets, TODAY);
    expect(cells[6]!.status).toBe("done"); // 7월
    expect(cells[7]!.status).toBe("current"); // 8월 (실제 이번 달)
    expect(cells[8]!.status).toBe("future"); // 9월
  });

  it("이번 달 누적 = 실제 자산", () => {
    const aug = buildYear(2026, assets, TODAY)[7]!;
    expect(aug.cumulative).toBe(assets);
  });

  it("2027은 전부 예정 (실제 날짜가 2026이라 완료로 안 뜸)", () => {
    const cells = buildYear(2027, assets, TODAY);
    expect(cells.every((c) => c.status === "future")).toBe(true);
  });

  it("지난 연도(2025)는 전부 완료", () => {
    const cells = buildYear(2025, assets, TODAY);
    expect(cells.every((c) => c.status === "done")).toBe(true);
  });

  it("미래 달은 D-day 양수, 이번·지난 달은 0", () => {
    const cells = buildYear(2026, assets, TODAY);
    expect(cells[8]!.dDay).toBeGreaterThan(0); // 9월
    expect(cells[7]!.dDay).toBe(0); // 8월
    expect(cells[6]!.dDay).toBe(0); // 7월
  });
});

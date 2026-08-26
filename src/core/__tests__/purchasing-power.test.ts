import { describe, expect, it } from "vitest";
import {
  DEFAULT_BENCHMARKS,
  checkPreservation,
  checkPreservationAll,
  preservationThreshold,
  realReturn,
} from "../purchasing-power";
import type { BenchmarkRate } from "../types";

const 물가: BenchmarkRate = { key: "inflation", label: "물가상승률", rate: 0.02 };
const 금리: BenchmarkRate = { key: "baseRate", label: "기준금리", rate: 0.025 };

describe("realReturn — 피셔 방정식", () => {
  it("명목 3% / 물가 2% → 실질 약 0.98%", () => {
    expect(realReturn(0.03, 0.02)).toBeCloseTo(0.009804, 5);
  });
  it("명목 = 기준이면 실질 0", () => {
    expect(realReturn(0.02, 0.02)).toBe(0);
  });
  it("명목 1% / 기준금리 2.5% → 실질 음수", () => {
    expect(realReturn(0.01, 0.025)).toBeLessThan(0);
  });
});

describe("preservationThreshold — 하한선은 기준율 그 자체", () => {
  it("기준율을 그대로 하한선으로 반환", () => {
    expect(preservationThreshold(0.025)).toBe(0.025);
  });
});

describe("checkPreservation — 유지/증가/감소 판정", () => {
  it("명목이 기준보다 높으면 growing", () => {
    const c = checkPreservation(0.05, 물가);
    expect(c.status).toBe("growing");
    expect(c.realReturn).toBeGreaterThan(0);
  });
  it("명목이 기준보다 낮으면 shrinking + 하한선 안내", () => {
    const c = checkPreservation(0.01, 금리);
    expect(c.status).toBe("shrinking");
    expect(c.message).toContain("2.5%");
    expect(c.message).toContain("줄어");
  });
  it("명목 = 기준이면 breakeven", () => {
    const c = checkPreservation(0.02, 물가);
    expect(c.status).toBe("breakeven");
  });
});

describe("checkPreservationAll — 물가·기준금리 동시 판정 (둘 다)", () => {
  it("기본값으로 두 기준을 모두 반환한다", () => {
    const checks = checkPreservationAll(0.03);
    expect(checks).toHaveLength(2);
    expect(checks.map((c) => c.benchmark)).toEqual(["inflation", "baseRate"]);
  });

  it("명목 3%면 물가(2%)는 넘지만 기준금리(2.5%)도 넘어 둘 다 growing", () => {
    const checks = checkPreservationAll(0.03);
    expect(checks.every((c) => c.status === "growing")).toBe(true);
  });

  it("명목 2.2%면 물가는 넘고(growing) 기준금리는 못 넘는다(shrinking)", () => {
    const checks = checkPreservationAll(0.022);
    const inflation = checks.find((c) => c.benchmark === "inflation")!;
    const baseRate = checks.find((c) => c.benchmark === "baseRate")!;
    expect(inflation.status).toBe("growing");
    expect(baseRate.status).toBe("shrinking");
  });

  it("DEFAULT_BENCHMARKS는 물가상승률·기준금리 순서", () => {
    expect(DEFAULT_BENCHMARKS.map((b) => b.label)).toEqual([
      "물가상승률",
      "기준금리",
    ]);
  });
});

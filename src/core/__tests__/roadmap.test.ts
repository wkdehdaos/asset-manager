import { describe, expect, it } from "vitest";
import {
  computeRoadmapProgress,
  type RoadmapMilestoneInput,
} from "../roadmap";

const GOAL = 100_000_000; // 1억

// 계획서 타임라인 기준 마일스톤
const MS = (done: Record<string, boolean> = {}): RoadmapMilestoneInput[] => [
  { id: "start", label: "2026.8", title: "시작", targetAmount: 4_000_000, done: done.start ?? false },
  { id: "predraft", label: "2027.2", title: "입대 전", targetAmount: 9_000_000, done: done.predraft ?? false },
  { id: "discharge", label: "2028.11", title: "전역", targetAmount: 40_000_000, done: done.discharge ?? false },
  { id: "mid", label: "2029.12", title: "중간점검", targetAmount: 70_000_000, done: done.mid ?? false },
  { id: "final", label: "2030.12", title: "최종 1억", targetAmount: 100_000_000, done: done.final ?? false },
];

describe("computeRoadmapProgress", () => {
  it("각 마일스톤의 최종목표 대비 %를 계산한다", () => {
    const r = computeRoadmapProgress(MS(), GOAL);
    const byId = Object.fromEntries(r.milestones.map((m) => [m.id, m]));
    expect(byId.predraft!.percentOfGoal).toBe(9); // 900만/1억
    expect(byId.discharge!.percentOfGoal).toBe(40); // 4000만/1억
    expect(byId.mid!.percentOfGoal).toBe(70);
    expect(byId.final!.percentOfGoal).toBe(100);
  });

  it("아무것도 달성 안 하면 진행률 0", () => {
    const r = computeRoadmapProgress(MS(), GOAL);
    expect(r.percent).toBe(0);
    expect(r.achievedCount).toBe(0);
    expect(r.nextTitle).toBe("시작"); // 목표금액 가장 작은 미달성
  });

  it("누적 목표라 진행률은 달성분 중 최댓값 기준(합산 아님)", () => {
    // 시작·입대전·전역 달성 → 최고 누적 4000만 → 40%
    const r = computeRoadmapProgress(
      MS({ start: true, predraft: true, discharge: true }),
      GOAL,
    );
    expect(r.achievedAmount).toBe(40_000_000);
    expect(r.percent).toBe(40);
    expect(r.achievedCount).toBe(3);
    expect(r.nextTitle).toBe("중간점검");
    expect(r.nextRemaining).toBe(30_000_000); // 7000만 - 4000만
  });

  it("최종 달성 시 100%", () => {
    const r = computeRoadmapProgress(MS({ final: true }), GOAL);
    expect(r.percent).toBe(100);
    expect(r.nextTitle).toBeNull();
    expect(r.nextRemaining).toBe(0);
  });

  it("현재 자산으로 도달한 마일스톤은 reached=true", () => {
    const r = computeRoadmapProgress(MS(), GOAL, 10_000_000); // 현재 1000만
    const byId = Object.fromEntries(r.milestones.map((m) => [m.id, m]));
    expect(byId.start!.reached).toBe(true); // 400만 ≤ 1000만
    expect(byId.predraft!.reached).toBe(true); // 900만 ≤ 1000만
    expect(byId.discharge!.reached).toBe(false); // 4000만 > 1000만
  });

  it("finalGoal이 0이면 %는 0 (0 나눗셈 방지)", () => {
    const r = computeRoadmapProgress(MS({ final: true }), 0);
    expect(r.percent).toBe(0);
    expect(r.milestones[0]!.percentOfGoal).toBe(0);
  });
});

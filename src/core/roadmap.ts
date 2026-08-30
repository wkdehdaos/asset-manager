/**
 * 로드맵(장기 목표 계획표) 진행률 엔진.
 * 마일스톤 = 특정 시점의 "누적 자산 목표"(예: 전역 시 4,000만). 최종목표(1억) 대비
 * 각 마일스톤이 몇 %인지, 지금까지 달성한 진행률이 몇 %인지 계산한다.
 *
 * 순수 함수만 (CLAUDE.md 규칙 2). 금액은 원 단위 정수 (규칙 3).
 * 계산은 여기서만 하고 LLM/화면은 결과를 표시만 한다 (규칙 1).
 */
import type { Won } from "./types";

/** 마일스톤 입력 — 시점별 누적 자산 목표와 달성 여부. */
export interface RoadmapMilestoneInput {
  id: string;
  /** 시점 라벨 (예: "2027.2") */
  label: string;
  title: string;
  /** 이 시점의 누적 목표 자산(원). 최종목표 대비 % 산정 기준. */
  targetAmount: Won;
  done: boolean;
}

/** 화면용 마일스톤 — 최종목표 대비 비율과 도달 가능 여부를 덧붙임. */
export interface RoadmapMilestoneView extends RoadmapMilestoneInput {
  /** 최종목표 대비 이 지점의 비율(%) = targetAmount / finalGoal. 0~100 정수. */
  percentOfGoal: number;
  /** 현재 자산으로 이미 도달한 목표인가 (currentAssets >= targetAmount). */
  reached: boolean;
}

/** 로드맵 전체 진행 상황. */
export interface RoadmapProgress {
  finalGoal: Won;
  /** 달성 체크한 마일스톤 중 최고 누적목표 (누적이라 합산이 아닌 최댓값). */
  achievedAmount: Won;
  /** 최종목표 대비 진행률(%). 0~100 정수. */
  percent: number;
  achievedCount: number;
  total: number;
  milestones: RoadmapMilestoneView[];
  /** 다음(아직 미달성) 마일스톤 제목. 전부 달성이면 null. */
  nextTitle: string | null;
  /** 다음 마일스톤까지 남은 금액 (현재 자산 기준). 없으면 0. */
  nextRemaining: Won;
}

/** 안전한 퍼센트 계산 — finalGoal이 0 이하이면 0. 0~100으로 자른 정수. */
function pct(part: Won, whole: Won): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((part / whole) * 100)));
}

/**
 * 마일스톤 목록으로 진행률을 계산한다.
 * @param milestones 시점 순으로 정렬됐다고 가정하지 않는다 (내부에서 최댓값으로 처리).
 * @param finalGoal 최종 목표 금액 (예: 1억).
 * @param currentAssets 현재 자산 — 각 마일스톤 도달 여부(reached) 판정용. 기본 0.
 */
export function computeRoadmapProgress(
  milestones: RoadmapMilestoneInput[],
  finalGoal: Won,
  currentAssets: Won = 0,
): RoadmapProgress {
  const views: RoadmapMilestoneView[] = milestones.map((m) => ({
    ...m,
    percentOfGoal: pct(m.targetAmount, finalGoal),
    reached: currentAssets >= m.targetAmount,
  }));

  // 누적 목표라서 진행률은 '달성한 것 중 최고 누적목표' 기준 (합산하면 중복 계산됨).
  const achievedAmount = views
    .filter((m) => m.done)
    .reduce((max, m) => Math.max(max, m.targetAmount), 0);

  const achievedCount = views.filter((m) => m.done).length;

  // 다음 목표 = 현재 달성액보다 목표금액이 큰 것 중 가장 작은 것.
  // (누적이라 이미 넘어선 하위 마일스톤은 건너뛴다. 최종 도달 시 next 없음.)
  const next = [...views]
    .sort((a, b) => a.targetAmount - b.targetAmount)
    .find((m) => m.targetAmount > achievedAmount);

  return {
    finalGoal,
    achievedAmount,
    percent: pct(achievedAmount, finalGoal),
    achievedCount,
    total: views.length,
    milestones: views,
    nextTitle: next?.title ?? null,
    nextRemaining: next ? Math.max(0, next.targetAmount - achievedAmount) : 0,
  };
}

/**
 * 목표 계산 엔진 (SPEC §5-1, §5-2).
 *
 * 이 파일의 모든 함수는 순수 함수다. 오늘 날짜가 필요하면 인자로 주입받는다.
 * (CLAUDE.md 규칙 2 — Date.now() 직접 호출 금지)
 */
import type {
  Feasibility,
  GoalAlternatives,
  GoalDiagnosis,
  GoalInput,
  Rate,
  Won,
} from "./types";

/** r이 0에 충분히 가까우면 0으로 나누는 대신 선형 근사로 분기한다. */
const RATE_EPSILON = 1e-9;

/**
 * 연수익률 → 월수익률.
 * r = (1 + 연수익률)^(1/12) − 1  (SPEC §5-1)
 */
export function toMonthlyRate(annualReturn: Rate): Rate {
  return Math.pow(1 + annualReturn, 1 / 12) - 1;
}

/**
 * 두 날짜 사이의 개월 수. 저축 납입 횟수로 쓰므로 정수(내림)로 센다.
 * 기한의 '일'이 시작일의 '일'보다 이르면 한 달 덜 찬 것으로 본다.
 */
export function monthsBetween(from: Date, to: Date): number {
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * 기말납입 연금 미래가치 (SPEC §5-1).
 * FV = PV·(1+r)^n + PMT·[((1+r)^n − 1) / r]
 * r ≈ 0 이면 FV = PV + PMT·n (0으로 나누기 회피).
 */
export function futureValue(
  currentAssets: Won,
  monthlySaving: Won,
  annualReturn: Rate,
  months: number,
): Won {
  const r = toMonthlyRate(annualReturn);
  if (Math.abs(r) < RATE_EPSILON) {
    return currentAssets + monthlySaving * months;
  }
  const growth = Math.pow(1 + r, months);
  return currentAssets * growth + monthlySaving * ((growth - 1) / r);
}

/**
 * 목표액 달성에 필요한 월 저축액 (SPEC §5-1).
 * PMT = (FV − PV·(1+r)^n) · r / ((1+r)^n − 1)
 * r ≈ 0 이면 PMT = (FV − PV) / n.
 * 결과는 원 단위 정수로 반올림 (CLAUDE.md 규칙 3).
 */
export function requiredMonthlySaving(
  targetAmount: Won,
  currentAssets: Won,
  annualReturn: Rate,
  months: number,
): Won {
  if (months <= 0) return Math.max(0, Math.round(targetAmount - currentAssets));
  const r = toMonthlyRate(annualReturn);
  if (Math.abs(r) < RATE_EPSILON) {
    return Math.round((targetAmount - currentAssets) / months);
  }
  const growth = Math.pow(1 + r, months);
  const pmt = ((targetAmount - currentAssets * growth) * r) / (growth - 1);
  return Math.round(pmt);
}

/**
 * 필요 연수익률 역산 — 이분법 (SPEC §5-2).
 * FV는 r에 대해 단조증가하므로 이분법이 안전하다.
 * 탐색 구간 [-0.5, 3.0], 200회 반복. 상한으로도 도달 불가면 null.
 *
 * 반환값은 음수일 수 있다(저축만으로 목표 초과 달성 — 함정 3). 등급 판정은
 * judgeFeasibility가 담당한다.
 */
export function solveRequiredAnnualReturn(
  targetAmount: Won,
  currentAssets: Won,
  monthlySaving: Won,
  months: number,
): Rate | null {
  let lo = -0.5;
  let hi = 3.0;

  // 상한 수익률로도 목표에 못 미치면 불가능
  if (futureValue(currentAssets, monthlySaving, hi, months) < targetAmount) {
    return null;
  }
  // 하한 수익률에서 이미 목표를 넘으면 더 낮은 수익률이면 충분 → 하한을 답으로
  if (futureValue(currentAssets, monthlySaving, lo, months) >= targetAmount) {
    return lo;
  }

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (futureValue(currentAssets, monthlySaving, mid, months) < targetAmount) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * 필요수익률 → 실현가능성 등급 (SPEC §5-2 표 + 함정 3).
 * requiredAnnualReturn이 null이면 도달 불가 → unrealistic.
 * 음수면 저축만으로 목표 초과 달성 → 별도 문구.
 */
export function judgeFeasibility(
  requiredAnnualReturn: Rate | null,
): Feasibility {
  if (requiredAnnualReturn === null) {
    return {
      grade: "unrealistic",
      requiredAnnualReturn: null,
      message: "현재 저축액으로는 어떤 수익률로도 도달할 수 없습니다. 목표 조정이 필요합니다.",
      reachableBySavingAlone: false,
    };
  }

  // 함정 3: 음수 필요수익률 — "−9% 수익률이 필요합니다"는 혼란스럽다.
  if (requiredAnnualReturn < 0) {
    return {
      grade: "comfortable",
      requiredAnnualReturn,
      message: "저축만으로 목표를 초과 달성할 수 있습니다.",
      reachableBySavingAlone: true,
    };
  }

  const pct = Math.round(requiredAnnualReturn * 1000) / 10; // 표시용 퍼센트(소수 1자리)
  if (requiredAnnualReturn <= 0.04) {
    return {
      grade: "comfortable",
      requiredAnnualReturn,
      message: `필요 연수익률 ${pct}% — 예적금 수준으로 달성 가능합니다.`,
      reachableBySavingAlone: false,
    };
  }
  if (requiredAnnualReturn <= 0.08) {
    return {
      grade: "achievable",
      requiredAnnualReturn,
      message: `필요 연수익률 ${pct}% — 적절한 분산투자가 필요합니다.`,
      reachableBySavingAlone: false,
    };
  }
  if (requiredAnnualReturn <= 0.15) {
    return {
      grade: "stretch",
      requiredAnnualReturn,
      message: `필요 연수익률 ${pct}% — 공격적인 수준이며 원금 손실 가능성이 있습니다.`,
      reachableBySavingAlone: false,
    };
  }
  return {
    grade: "unrealistic",
    requiredAnnualReturn,
    message: `필요 연수익률 ${pct}% — 비현실적입니다. 목표 조정이 필요합니다.`,
    reachableBySavingAlone: false,
  };
}

/**
 * 주어진 저축액·수익률로 목표에 도달하는 최소 개월 수.
 * 도달 불가(저축 0 이하 & 수익률로도 못 넘김)면 null.
 * 상한은 100년(1200개월)으로 둔다.
 */
export function monthsToReachGoal(
  targetAmount: Won,
  currentAssets: Won,
  monthlySaving: Won,
  annualReturn: Rate,
  maxMonths = 1200,
): number | null {
  if (currentAssets >= targetAmount) return 0;
  for (let n = 1; n <= maxMonths; n++) {
    if (futureValue(currentAssets, monthlySaving, annualReturn, n) >= targetAmount) {
      return n;
    }
  }
  return null;
}

/**
 * 대시보드용 종합 진단 (SPEC §5-1·§5-2 결합).
 * monthlySavingCapacity: 소득·지출에서 산출한 '실제로 저축 가능한 월 금액'.
 */
export function diagnoseGoal(
  goal: GoalInput,
  monthlySavingCapacity: Won,
  today: Date,
): GoalDiagnosis {
  const months = monthsBetween(today, goal.targetDate);

  const required = requiredMonthlySaving(
    goal.targetAmount,
    goal.currentAssets,
    goal.expectedAnnualReturn,
    months,
  );

  // capacity만 저축한다고 할 때 목표 달성에 필요한 수익률로 실현가능성 판정
  const requiredReturn = solveRequiredAnnualReturn(
    goal.targetAmount,
    goal.currentAssets,
    monthlySavingCapacity,
    months,
  );

  const projected = Math.round(
    futureValue(
      goal.currentAssets,
      monthlySavingCapacity,
      goal.expectedAnnualReturn,
      months,
    ),
  );

  return {
    months,
    requiredMonthlySaving: required,
    monthlySavingCapacity,
    monthlyShortfall: required - monthlySavingCapacity,
    projectedAmount: projected,
    onTrack: projected >= goal.targetAmount,
    feasibility: judgeFeasibility(requiredReturn),
  };
}

/**
 * 목표가 비현실적일 때의 3가지 대안 (기한연장/목표축소/저축증액).
 */
export function suggestAlternatives(
  goal: GoalInput,
  monthlySavingCapacity: Won,
  today: Date,
): GoalAlternatives {
  const months = monthsBetween(today, goal.targetDate);

  // 1) 기한 연장 — 현재 저축액으로 목표에 도달하는 최단 개월 수
  const extendMonths = monthsToReachGoal(
    goal.targetAmount,
    goal.currentAssets,
    monthlySavingCapacity,
    goal.expectedAnnualReturn,
  );
  let newTargetDate: Date | null = null;
  if (extendMonths !== null) {
    newTargetDate = new Date(today);
    newTargetDate.setMonth(newTargetDate.getMonth() + extendMonths);
  }

  // 2) 목표 축소 — 현재 저축액·기한으로 실제 도달 가능한 금액
  const achievable = Math.round(
    futureValue(
      goal.currentAssets,
      monthlySavingCapacity,
      goal.expectedAnnualReturn,
      months,
    ),
  );

  // 3) 저축 증액 — 기한을 지키려면 필요한 월 저축액과 추가 부담분
  const required = requiredMonthlySaving(
    goal.targetAmount,
    goal.currentAssets,
    goal.expectedAnnualReturn,
    months,
  );

  return {
    extendDeadline: {
      months: extendMonths ?? 0,
      newTargetDate,
    },
    reduceTarget: {
      achievableAmount: achievable,
    },
    increaseSaving: {
      requiredMonthlySaving: required,
      additionalPerMonth: Math.max(0, required - monthlySavingCapacity),
    },
  };
}

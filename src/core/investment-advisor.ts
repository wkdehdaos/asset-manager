/**
 * 투자 여력 엔진 (SPEC §5-5).
 *
 * 가드레일 (CLAUDE.md 규칙 5 · SPEC §9):
 * - 특정 상품·종목·코인 언급 금지. 자산군(안전/채권/주식) 수준까지만.
 * - 모든 투자 관련 출력에 원금 손실 가능성을 명시.
 * - "투자 권유가 아닌 일반적 참고 정보"임을 고지.
 *
 * 순수 함수. 프레임워크·네트워크 의존성 없음 (CLAUDE.md 규칙 2).
 */
import type {
  AchievabilityVerdict,
  InvestmentCapacity,
  Rate,
  RiskProfile,
  RiskProfileKey,
  Won,
} from "./types";

/** 참고 배분 문구 — 모든 성향에 공통으로 붙인다. */
const REFERENCE_NOTE =
  "특정 상품·종목이 아닌 자산군 수준의 일반 참고 정보이며, 투자 권유가 아닙니다.";

/**
 * 남은 기간(개월) → 참고 성향·배분 (SPEC §5-5 표).
 * <12 원금보존 100/0/0 · <36 보수 40/30/30 · <84 중립 15/30/55 · ≥84 성장 5/15/80
 */
export function riskProfileFor(remainingMonths: number): RiskProfile {
  let key: RiskProfileKey;
  let label: string;
  let allocation: RiskProfile["allocation"];

  if (remainingMonths < 12) {
    key = "preservation";
    label = "원금보존";
    allocation = { safe: 100, bonds: 0, stocks: 0 };
  } else if (remainingMonths < 36) {
    key = "conservative";
    label = "보수";
    allocation = { safe: 40, bonds: 30, stocks: 30 };
  } else if (remainingMonths < 84) {
    key = "neutral";
    label = "중립";
    allocation = { safe: 15, bonds: 30, stocks: 55 };
  } else {
    key = "growth";
    label = "성장";
    allocation = { safe: 5, bonds: 15, stocks: 80 };
  }

  return { key, label, allocation, note: REFERENCE_NOTE };
}

/** 성향별로 일반적으로 기대 가능한 연수익률 상한(가정치, 보장 아님). */
const PROFILE_RETURN_CEILING: Record<RiskProfileKey, Rate> = {
  preservation: 0.03,
  conservative: 0.06,
  neutral: 0.09,
  growth: 0.12,
};

/** 비상금 개월 수 허용 범위(SPEC §5-5: 3~6개월, 기본 4). */
function clampEmergencyMonths(months: number): number {
  return Math.min(6, Math.max(3, months));
}

/**
 * 투자 여력 계산 (SPEC §5-5).
 * 비상금 목표 = 월 고정지출 × N개월. 투자가능액 = 유동자산 − 비상금 목표.
 * 비상금 미달이면 월 저축의 30%만 투자 배정 + 경고.
 */
export function calculateInvestmentCapacity(params: {
  /** 유동자산(현금성) */
  liquidAssets: Won;
  /** 월 고정지출 */
  monthlyFixedExpense: Won;
  /** 월 저축 가능액 */
  monthlySaving: Won;
  /** 목표까지 남은 개월(성향 판정용) */
  remainingMonths: number;
  /** 비상금 개월 수(기본 4, 3~6로 clamp) */
  emergencyMonths?: number;
}): InvestmentCapacity {
  const {
    liquidAssets,
    monthlyFixedExpense,
    monthlySaving,
    remainingMonths,
    emergencyMonths = 4,
  } = params;

  const profile = riskProfileFor(remainingMonths);
  const emergencyTarget = Math.round(
    monthlyFixedExpense * clampEmergencyMonths(emergencyMonths),
  );
  const emergencyShortfall = Math.max(0, emergencyTarget - liquidAssets);
  const emergencyFunded = emergencyShortfall === 0;

  const warnings: string[] = [];

  let investableAssets: Won;
  let monthlyInvestment: Won;
  if (emergencyFunded) {
    investableAssets = Math.max(0, liquidAssets - emergencyTarget);
    monthlyInvestment = Math.max(0, monthlySaving);
  } else {
    // 비상금 미달: 유동자산 여유분은 없고, 월 저축의 30%만 투자에 배정
    investableAssets = 0;
    monthlyInvestment = Math.round(Math.max(0, monthlySaving) * 0.3);
    warnings.push(
      `비상금이 목표보다 ${format(emergencyShortfall)}원 부족합니다. 비상금을 먼저 확보하고, 지금은 저축의 30%만 투자에 배정하는 것을 권장합니다.`,
    );
  }

  // 원금 손실 가능성 — 위험자산이 섞이면 반드시 고지
  if (profile.allocation.bonds > 0 || profile.allocation.stocks > 0) {
    warnings.push(
      "투자에는 원금 손실 가능성이 있으며, 예상 수익률은 보장되지 않습니다.",
    );
  }
  warnings.push(REFERENCE_NOTE);

  return {
    emergencyTarget,
    emergencyShortfall,
    emergencyFunded,
    investableAssets,
    monthlyInvestment,
    profile,
    warnings,
  };
}

/**
 * 목표 필요수익률을 해당 성향으로 감당할 수 있는지 판정.
 * requiredReturn이 null이면 도달 불가. 음수면 저축만으로 충분.
 */
export function isReturnAchievable(
  requiredAnnualReturn: Rate | null,
  profile: RiskProfile,
): AchievabilityVerdict {
  const ceiling = PROFILE_RETURN_CEILING[profile.key];

  if (requiredAnnualReturn === null) {
    return {
      achievable: false,
      profileCeiling: ceiling,
      message: "어떤 성향으로도 도달할 수 없습니다. 목표 조정이 필요합니다.",
    };
  }

  if (requiredAnnualReturn < 0) {
    return {
      achievable: true,
      profileCeiling: ceiling,
      message: "저축만으로 목표를 달성할 수 있어 투자 수익이 필수는 아닙니다.",
    };
  }

  const ceilingPct = Math.round(ceiling * 1000) / 10;
  const requiredPct = Math.round(requiredAnnualReturn * 1000) / 10;

  if (requiredAnnualReturn <= ceiling) {
    return {
      achievable: true,
      profileCeiling: ceiling,
      message: `필요 연수익률 ${requiredPct}%는 ${profile.label} 성향의 일반적 기대 범위(약 ${ceilingPct}%) 안입니다. 다만 원금 손실 가능성은 있습니다.`,
    };
  }

  return {
    achievable: false,
    profileCeiling: ceiling,
    message: `필요 연수익률 ${requiredPct}%는 ${profile.label} 성향의 일반적 기대 범위(약 ${ceilingPct}%)를 넘습니다. 기한 연장이나 목표 조정을 검토하세요.`,
  };
}

/** 문구 조립용 최소 포맷(원 단위 그룹핑). 화면 표시는 별도 계층에서. */
function format(won: Won): string {
  return Math.round(won).toLocaleString("ko-KR");
}

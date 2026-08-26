/**
 * core 전역에서 쓰는 순수 타입 정의.
 * 이 폴더는 React·Prisma·네트워크 의존성이 0이어야 한다 (CLAUDE.md 규칙 2).
 * 금액은 전부 원 단위 정수(KRW). 부동소수점 금액 금지 (CLAUDE.md 규칙 3).
 */

/** 원 단위 정수 금액임을 문서화하기 위한 별칭. 런타임 검증은 하지 않는다. */
export type Won = number;

/** 연수익률·비율은 소수로 저장(0.03 = 3%). LLM에 넘길 때만 퍼센트로 변환한다. */
export type Rate = number;

/** SPEC §4 카테고리 목록 */
export const CATEGORIES = [
  "housing",
  "food",
  "dining",
  "transport",
  "utilities",
  "communication",
  "insurance",
  "healthcare",
  "education",
  "shopping",
  "leisure",
  "subscription",
  "debt",
  "etc",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** 한국어 UI 라벨은 상수 맵에 모은다 (CLAUDE.md 코드 스타일). */
export const CATEGORY_LABELS_KO: Record<Category, string> = {
  housing: "주거",
  food: "식료품",
  dining: "외식",
  transport: "교통",
  utilities: "공과금",
  communication: "통신",
  insurance: "보험",
  healthcare: "의료",
  education: "교육",
  shopping: "쇼핑",
  leisure: "여가",
  subscription: "구독",
  debt: "부채상환",
  etc: "기타",
};

// ── 목표 계산 (goal-engine) ────────────────────────────────────────────────

/** 목표 정의. 계산 함수에 넘기는 입력. */
export interface GoalInput {
  /** 목표 금액 */
  targetAmount: Won;
  /** 목표 달성 기한 */
  targetDate: Date;
  /** 현재 보유 자산 */
  currentAssets: Won;
  /** 사용자가 기대하는 연수익률 (소수) */
  expectedAnnualReturn: Rate;
}

/** 실현가능성 4단계 등급 (SPEC §5-2). */
export type FeasibilityGrade =
  | "comfortable"
  | "achievable"
  | "stretch"
  | "unrealistic";

export interface Feasibility {
  grade: FeasibilityGrade;
  /** 필요 연수익률(소수). 도달 불가면 null. 저축만으로 초과 달성이면 음수일 수 있다. */
  requiredAnnualReturn: Rate | null;
  /** 화면·LLM에 그대로 쓸 한국어 문구 */
  message: string;
  /** 함정 3: 저축만으로 목표를 초과 달성하는 경우 true */
  reachableBySavingAlone: boolean;
}

/** 대시보드에 그대로 쓸 종합 진단 결과 (diagnoseGoal). */
export interface GoalDiagnosis {
  /** 목표까지 남은 개월 수 */
  months: number;
  /** 기대수익률 가정하에 목표 달성에 필요한 월 저축액 */
  requiredMonthlySaving: Won;
  /** 사용자가 실제로 저축 가능한 월 금액 */
  monthlySavingCapacity: Won;
  /** requiredMonthlySaving - capacity. 양수면 부족. */
  monthlyShortfall: Won;
  /** capacity로 저축했을 때 기한 시점의 예상 자산 */
  projectedAmount: Won;
  /** projectedAmount >= targetAmount */
  onTrack: boolean;
  /** capacity만 저축한다고 할 때 목표 달성에 필요한 연수익률 기준 실현가능성 */
  feasibility: Feasibility;
}

// ── 투자 여력 (investment-advisor) ────────────────────────────────────────

/** 투자 성향 4단계 (SPEC §5-5). */
export type RiskProfileKey =
  | "preservation"
  | "conservative"
  | "neutral"
  | "growth";

/** 자산군 수준 배분(퍼센트 정수). 특정 상품·종목이 아니라 자산군까지만. */
export interface AssetAllocation {
  /** 안전(예적금·MMF 등) */
  safe: number;
  /** 채권 */
  bonds: number;
  /** 주식 */
  stocks: number;
}

/** 자산군 한국어 라벨 (UI 문자열은 상수 맵에 모은다). */
export const ALLOCATION_LABELS_KO: Record<keyof AssetAllocation, string> = {
  safe: "안전",
  bonds: "채권",
  stocks: "주식",
};

export interface RiskProfile {
  key: RiskProfileKey;
  label: string;
  /** 참고 배분 — 투자 권유가 아닌 일반 원칙 (SPEC §5-5·§9). */
  allocation: AssetAllocation;
  note: string;
}

/** 투자 여력 계산 결과 (SPEC §5-5). */
export interface InvestmentCapacity {
  /** 비상금 목표 = 월 고정지출 × N개월 */
  emergencyTarget: Won;
  /** 비상금 부족분(없으면 0) */
  emergencyShortfall: Won;
  emergencyFunded: boolean;
  /** 비상금 확보 후 지금 투자 가능한 유동자산 여유분(미달이면 0) */
  investableAssets: Won;
  /** 매달 투자에 배정 권장하는 금액 */
  monthlyInvestment: Won;
  /** 기간 기반 참고 배분 */
  profile: RiskProfile;
  /** 원금 손실 가능성 등 경고·고지 문구 */
  warnings: string[];
}

/** 목표 필요수익률을 성향으로 감당 가능한지 판정. */
export interface AchievabilityVerdict {
  achievable: boolean;
  /** 해당 성향에서 일반적으로 기대 가능한 연수익률 상한(가정치) */
  profileCeiling: Rate;
  message: string;
}

// ── 지출 분석 (spending-analyzer) ─────────────────────────────────────────

/** 거래 한 건. Prisma 모델과 별개인 core 전용 순수 타입. */
export interface Transaction {
  date: Date;
  /** 지출 금액(양수, 원 단위 정수) */
  amount: Won;
  category: Category;
  /** 고정지출(월세·보험·구독) 여부. "줄일 수 있는 돈" 계산의 핵심 (SPEC §4). */
  isFixed: boolean;
}

/** 한 달치 지출 요약. */
export interface MonthSummary {
  year: number;
  /** 1~12 */
  month: number;
  total: Won;
  fixedTotal: Won;
  variableTotal: Won;
  byCategory: Record<Category, Won>;
  /** 카테고리별 결제 건수 — 반복결제(함정 1) 판정에 쓴다. */
  countByCategory: Record<Category, number>;
}

/** 월중 페이스 판정 결과 (SPEC §5-3). */
export interface MonthPace {
  /** tight=긴축, ok=정상, surplus=여유 */
  signal: "tight" | "ok" | "surplus";
  /** 경과일 / 그달 총일수 */
  elapsedRatio: number;
  /** 오늘까지 실제 지출 합계 */
  spentSoFar: Won;
  /** 예상 고정지출 = max(이미 나간 고정, 과거 고정 중앙값) */
  projectedFixed: Won;
  /** 예상 변동지출 = 현재 변동지출 / 경과비율 (변동만 외삽) */
  projectedVariable: Won;
  /** 예상 월말지출 */
  projectedTotal: Won;
  budget: Won;
  /** 함정 2: 변동지출 한도를 이미 소진했는가 */
  overBudget: boolean;
  /** 남은 하루당 쓸 수 있는 변동지출 한도. 초과 상태면 null. */
  dailyLimit: Won | null;
  /** 초과 금액(초과 상태일 때만 양수, 아니면 0) */
  overAmount: Won;
  message: string;
}

/** surplus 여유분 자동 배분 결과 (SPEC §5-3). */
export interface SurplusAllocation {
  /** 비상금 부족분에 우선 배정 */
  toEmergency: Won;
  /** 나머지의 60% */
  toGoal: Won;
  /** 나머지의 40% */
  toInvestment: Won;
}

/** 카테고리 이상 탐지 결과 (SPEC §5-4). */
export interface CategoryAnomaly {
  category: Category;
  label: string;
  current: Won;
  /** 중앙값 기준선 */
  baseline: Won;
  /** (current − baseline) / baseline */
  deviationRatio: Rate;
  /** current − baseline */
  deviationAmount: Won;
  message: string;
}

// ── 구매력·실질수익률 (purchasing-power) ──────────────────────────────────

/** 자산 가치 하락 여부를 재는 기준. */
export type Benchmark = "inflation" | "baseRate";

/** 기준율 한 개(라벨 + 소수 비율). 값은 수시로 바뀌므로 주입받는다. */
export interface BenchmarkRate {
  key: Benchmark;
  label: string;
  /** 소수(0.02 = 2%) */
  rate: Rate;
}

/** 명목수익률이 기준율을 넘는지 판정한 결과. */
export interface PreservationCheck {
  benchmark: Benchmark;
  label: string;
  /** 이 기준에서 '자산이 안 떨어지려면' 넘어야 하는 명목수익률 하한선 = 기준율 */
  thresholdReturn: Rate;
  /** 비교 대상 명목수익률 */
  nominalReturn: Rate;
  /** 피셔 방정식 실질수익률: (1+명목)/(1+기준) − 1 */
  realReturn: Rate;
  /** shrinking=실질 감소, breakeven=본전, growing=실질 증가 */
  status: "shrinking" | "breakeven" | "growing";
  message: string;
}

/** 목표가 비현실적일 때 제시하는 대안 3종 (suggestAlternatives). */
export interface GoalAlternatives {
  /** 기한 연장: 현재 저축액으로 도달 가능한 최단 기한 */
  extendDeadline: {
    months: number;
    /** today 기준으로 계산된 새 목표일 */
    newTargetDate: Date | null;
  };
  /** 목표 축소: 현재 저축액·기한으로 실제 도달 가능한 금액 */
  reduceTarget: {
    achievableAmount: Won;
  };
  /** 저축 증액: 기한을 지키려면 필요한 월 저축액과 추가 부담분 */
  increaseSaving: {
    requiredMonthlySaving: Won;
    additionalPerMonth: Won;
  };
}

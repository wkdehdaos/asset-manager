/**
 * "자산 1억 프로젝트 (2030.12)" 계획서를 앱 데이터로 옮긴 기본값.
 * 최초 로드맵 방문 시 이 목록으로 PlanItem을 시드한다 (getRoadmap).
 * key는 시드 idempotent(중복 방지)용 안정 식별자.
 *
 * 계산이 아니라 데이터라 lib에 둔다 (core는 순수 계산만).
 */

/** 최종 목표: 2030년 12월 금융자산 1억. */
export const FINAL_GOAL = 100_000_000;

/** 할 일 성격 분류 — 같은 카테고리끼리 묶고 색으로 구분한다. */
export type PlanCategory =
  | "income"
  | "saving"
  | "investment"
  | "setup"
  | "growth"
  | "admin";

/** 화면 표시 순서 (이 순서로 월 안에서 정렬). */
export const PLAN_CATEGORY_ORDER: PlanCategory[] = [
  "income",
  "saving",
  "investment",
  "setup",
  "growth",
  "admin",
];

/** 카테고리 라벨 + 이모지 + 배지 색 (UI 문자열·스타일은 상수 맵에 모은다 — CLAUDE.md). */
export const PLAN_CATEGORY_META: Record<
  PlanCategory,
  { label: string; emoji: string; className: string }
> = {
  income: { label: "수입", emoji: "💵", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  saving: { label: "저축", emoji: "💰", className: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  investment: { label: "투자", emoji: "📈", className: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  setup: { label: "가입·세팅", emoji: "🏦", className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  growth: { label: "자기계발", emoji: "📚", className: "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300" },
  admin: { label: "준비·서류", emoji: "📄", className: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300" },
};

export interface DefaultPlanItem {
  key: string;
  kind: "milestone" | "task";
  group: string;
  /** 시점 라벨 (마일스톤에만). */
  label?: string;
  title: string;
  /** 마일스톤의 누적 목표 자산(원). */
  targetAmount?: number;
  /** 할 일 카테고리 (task에만). */
  category?: PlanCategory;
  /** 이 할 일에 걸린 금액(원). 체크 시 "N원 완료!" 토스트·누적 저축액 집계에 쓴다. */
  amount?: number;
  /** 시드 시 기본 달성 여부 (예: 현재 시점 '시작'은 이미 달성). */
  done?: boolean;
}

/** 타임라인 자산 마일스톤 (누적 목표). */
const MILESTONES: DefaultPlanItem[] = [
  { key: "ms-start", kind: "milestone", group: "마일스톤", label: "2026.8", title: "시작 — 현재 자산 400만", targetAmount: 4_000_000, done: true },
  { key: "ms-predraft", kind: "milestone", group: "마일스톤", label: "2027.2", title: "입대 전 900만 확보", targetAmount: 9_000_000 },
  { key: "ms-discharge", kind: "milestone", group: "마일스톤", label: "2028.11", title: "전역 — 약 4,000만", targetAmount: 40_000_000 },
  { key: "ms-mid", kind: "milestone", group: "마일스톤", label: "2029.12", title: "중간 점검 — 약 7,000만", targetAmount: 70_000_000 },
  { key: "ms-final", kind: "milestone", group: "마일스톤", label: "2030.12", title: "최종 목표 — 1억", targetAmount: 100_000_000 },
];

/**
 * 월별 실행 체크리스트 (계획서를 달 단위로 정리).
 * group = "YYYY년 M월" — 화면에서 이 값으로 월별 접이식 섹션을 만든다.
 * 배열 순서가 곧 시간 순 (getRoadmap이 order로 유지).
 * 복무 전 기간처럼 반복 루틴이 도는 구간은 대표 체크 시점에만 항목을 둔다.
 */
const TASKS: DefaultPlanItem[] = [
  // 2026년 9월 — 지금 당장 (계획서 ⑦)
  { key: "m2609-parking", kind: "task", group: "2026년 9월", category: "saving", amount: 300_000, title: "용돈 30만 → 파킹통장 자동이체 설정 (1억의 첫 실행)" },
  { key: "m2609-auto53", kind: "task", group: "2026년 9월", category: "saving", amount: 530_000, title: "알바·과외 급여일 53만 자동이체 (월 저축 83만 완성)" },
  { key: "m2609-tutor", kind: "task", group: "2026년 9월", category: "income", amount: 300_000, title: "과외 자리 확보 (+30만 수입)" },
  { key: "m2609-income2025", kind: "task", group: "2026년 9월", category: "admin", title: "2025년 소득 유무 확인 → 12월 청미적 2차 가입 가능 판정" },
  { key: "m2609-counsel", kind: "task", group: "2026년 9월", category: "admin", title: "서민금융진흥원 재무상담 온라인 이수 (우대 0.2%p)" },
  { key: "m2609-tuition", kind: "task", group: "2026년 9월", category: "admin", title: "부모님 회사 학자금 규정 확인 (정액 vs 실비)" },
  { key: "m2609-nosaving", kind: "task", group: "2026년 9월", category: "admin", title: "타 예·적금 개설 금지 — 파킹통장만 사용 (하나 우대 0.5%p 사수)" },

  // 2026년 10월 — 은행 세팅
  { key: "m2610-hanaapp", kind: "task", group: "2026년 10월", category: "setup", title: "하나은행 앱 설치·본인인증·입출금계좌 정비" },
  { key: "m2610-banks", kind: "task", group: "2026년 10월", category: "setup", title: "장병내일용 은행 2곳 선정 (하나 제외, 30만+25만 분산)" },
  { key: "m2610-income-log", kind: "task", group: "2026년 10월", category: "admin", title: "알바·과외 소득 기록 남기기 (소득요건 대비)" },

  // 2026년 11월 — 가입 공고 대비
  { key: "m2611-notice", kind: "task", group: "2026년 11월", category: "admin", title: "청년미래적금 2차 가입 공고 알림 체크 시작 (하나 앱·금융위)" },
  { key: "m2611-scholar", kind: "task", group: "2026년 11월", category: "admin", title: "국가장학금 신청 일정 확인 (보통 11월)" },

  // 2026년 12월 — 청미적 A안 가입
  { key: "m2612-join", kind: "task", group: "2026년 12월", category: "setup", title: "청년미래적금 2차 가입 (2025 소득 있으면) — A안" },
  { key: "m2612-setup", kind: "task", group: "2026년 12월", category: "saving", amount: 500_000, title: "가입 시 월 50만 자동이체 + 나라사랑카드 소액 정기결제 연결" },

  // 2027년 1월 — 저축 막바지
  { key: "m2701-split", kind: "task", group: "2027년 1월", category: "investment", title: "모은 돈 배분: 비상금·버퍼 300만 파킹 / 500~600만 투자계좌" },

  // 2027년 2월 — 입대 전 마무리
  { key: "m2702-goal900", kind: "task", group: "2027년 2월", category: "saving", title: "입대 전 저축 완료 — 목표 900만 확보 점검" },
  { key: "m2702-rate", kind: "task", group: "2027년 2월", category: "admin", title: "은행연합회 소비자포털 금리 공시로 우대조건 최종 확인" },

  // 2027년 3월 — 입대
  { key: "m2703-cma-b", kind: "task", group: "2027년 3월 (입대)", category: "setup", title: "(B안) 훈련소에서 청년미래적금 하나은행 비대면 가입" },
  { key: "m2703-jangbyeong", kind: "task", group: "2027년 3월 (입대)", category: "setup", title: "장병내일준비적금 가입 (하나 제외 2곳, 월 55만)" },
  { key: "m2703-auto105", kind: "task", group: "2027년 3월 (입대)", category: "saving", amount: 1_050_000, title: "매월 적금 105만 자동이체 설정" },

  // 복무 중 (반복 점검)
  { key: "mmil-rate", kind: "task", group: "복무 중 (분기 점검)", category: "admin", title: "우대금리 실적(급여입금·카드결제 횟수) 앱에서 점검" },
  { key: "mmil-cert", kind: "task", group: "복무 중 (분기 점검)", category: "growth", title: "자격증 취득 (컴활·한국사) + 과외 준비 (수능 기출 정리)" },

  // 2028년 9월 — 전역 준비
  { key: "m2809-prejob", kind: "task", group: "2028년 9월 (전역 전)", category: "income", title: "전역 후 과외·알바 자리 미리 확보" },
  { key: "m2809-scholar", kind: "task", group: "2028년 9월 (전역 전)", category: "admin", title: "복학 대비 국가장학금 신청 일정 확인" },

  // 2028년 11월 — 전역
  { key: "m2811-payout", kind: "task", group: "2028년 11월 (전역)", category: "investment", title: "전역 확인서류 제출 → 군적금 만기금 수령 → 즉시 투자계좌" },
  { key: "m2811-salary", kind: "task", group: "2028년 11월 (전역)", category: "income", title: "알바비 하나은행 계좌로 수령 (급여 24회차 완성)" },
  { key: "m2811-tutor", kind: "task", group: "2028년 11월 (전역)", category: "income", title: "과외 2~3건 확보 (공백기 풀타임 알바 병행)" },

  // 2029년 3월 — 복학
  { key: "m2903-cma-keep", kind: "task", group: "2029년 3월 (복학)", category: "saving", amount: 500_000, title: "청년미래적금 50만 만기까지 유지" },
  { key: "m2903-routine", kind: "task", group: "2029년 3월 (복학)", category: "income", title: "학기 중 과외 2건 + 알바 루틴 (월 145) + 나머지 전액 투자" },
  { key: "m2903-scholar", kind: "task", group: "2029년 3월 (복학)", category: "income", title: "외부 재단 생활비형 장학금 신청 (학점 3.5~4.0 관리)" },

  // 2029년 12월 — 중간 점검
  { key: "m2912-check", kind: "task", group: "2029년 12월", category: "admin", title: "중간 점검 — 약 7,000만 도달 확인" },
  { key: "m2912-isa", kind: "task", group: "2029년 12월", category: "investment", title: "투자는 ISA 계좌로 절세 유지" },

  // 2030년 3월 — 청미적 만기
  { key: "m3003-mature", kind: "task", group: "2030년 3월", category: "investment", title: "청년미래적금 만기 약 2,130만 수령 → 재투자" },

  // 2030년 12월 — 최종
  { key: "m3012-final", kind: "task", group: "2030년 12월", category: "admin", title: "최종 목표 점검 — 9,000만~1억 (9,000만이어도 성공)" },
];

export const DEFAULT_PLAN: DefaultPlanItem[] = [...MILESTONES, ...TASKS];

/**
 * 월 그룹 → 연월 키(YYYYMM). 오늘 날짜와 비교해 "아직 안 온 달"을 숨기는 데 쓴다.
 * "복무 중"처럼 특정 월이 없는 구간은 대표 시점으로 근사한다.
 */
export const GROUP_MONTH: Record<string, number> = {
  "2026년 9월": 202609,
  "2026년 10월": 202610,
  "2026년 11월": 202611,
  "2026년 12월": 202612,
  "2027년 1월": 202701,
  "2027년 2월": 202702,
  "2027년 3월 (입대)": 202703,
  "복무 중 (분기 점검)": 202707,
  "2028년 9월 (전역 전)": 202809,
  "2028년 11월 (전역)": 202811,
  "2029년 3월 (복학)": 202903,
  "2029년 12월": 202912,
  "2030년 3월": 203003,
  "2030년 12월": 203012,
};

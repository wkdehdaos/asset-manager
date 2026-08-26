/**
 * 지출 분석 엔진 (SPEC §5-3 월중 페이스, §5-4 카테고리 이상 탐지).
 *
 * 순수 함수. 오늘 날짜는 인자로 주입받는다 (CLAUDE.md 규칙 2).
 *
 * 함정 1 (SPEC §6): 월초에 몰린 반복결제(통신·보험)를 경과비율로 외삽하면
 *   전부 부풀려진다 → 반복결제는 외삽하지 않고 고정지출로 처리한다.
 * 함정 2 (SPEC §6): 예산 초과 시 하루 한도가 0원으로 뜬다 → 한도 대신
 *   초과 금액을 별도 상태값으로 반환한다.
 */
import {
  CATEGORIES,
  CATEGORY_LABELS_KO,
  type Category,
  type CategoryAnomaly,
  type MonthPace,
  type MonthSummary,
  type SurplusAllocation,
  type Transaction,
  type Won,
} from "./types";

// ── 소도구 ────────────────────────────────────────────────────────────────

/** 평균이 아니라 중앙값 — 이사·명절 같은 1회성 지출에 오염되지 않기 위해 (SPEC §5-4). */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function emptyCategoryMap(): Record<Category, Won> {
  const map = {} as Record<Category, Won>;
  for (const c of CATEGORIES) map[c] = 0;
  return map;
}

/** 해당 연·월(1~12)에 속하는 거래만 추린다. */
function transactionsInMonth(
  transactions: Transaction[],
  year: number,
  month: number,
): Transaction[] {
  return transactions.filter(
    (t) => t.date.getFullYear() === year && t.date.getMonth() === month - 1,
  );
}

/** 그달 총일수. new Date(y, m, 0)은 m월의 마지막 날을 준다(month는 1~12). */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// ── 요약 ──────────────────────────────────────────────────────────────────

/** 특정 연·월(1~12)의 지출 요약. */
export function summarizeMonth(
  transactions: Transaction[],
  year: number,
  month: number,
): MonthSummary {
  const byCategory = emptyCategoryMap();
  const countByCategory = emptyCategoryMap();
  let total = 0;
  let fixedTotal = 0;
  let variableTotal = 0;

  for (const t of transactionsInMonth(transactions, year, month)) {
    byCategory[t.category] += t.amount;
    countByCategory[t.category] += 1;
    total += t.amount;
    if (t.isFixed) fixedTotal += t.amount;
    else variableTotal += t.amount;
  }

  return { year, month, total, fixedTotal, variableTotal, byCategory, countByCategory };
}

/**
 * today 기준 직전 n개월(진행 중인 이번 달 제외)의 요약을 최신순으로 반환.
 */
export function recentMonths(
  transactions: Transaction[],
  today: Date,
  n = 6,
): MonthSummary[] {
  const result: MonthSummary[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    result.push(summarizeMonth(transactions, d.getFullYear(), d.getMonth() + 1));
  }
  return result;
}

/**
 * 카테고리별 기준선 = 최근 n개월 지출의 **중앙값** (SPEC §5-4).
 * 데이터가 없는 달은 0으로 포함해 정직한 월별 중앙값을 낸다.
 */
export function categoryBaseline(
  transactions: Transaction[],
  today: Date,
  n = 6,
): Record<Category, Won> {
  const months = recentMonths(transactions, today, n);
  const baseline = emptyCategoryMap();
  for (const c of CATEGORIES) {
    baseline[c] = Math.round(median(months.map((m) => m.byCategory[c])));
  }
  return baseline;
}

/**
 * 함정 1 핵심: 외삽하면 안 되는 '반복결제' 카테고리 집합.
 * 과거 대부분의 달에 등장하고, 등장한 달마다 결제 건수 중앙값이 1건 이하면
 * 매달 1번씩 빠져나가는 고정성 지출로 보고 외삽 대상에서 제외한다.
 */
export function recurringCategories(
  transactions: Transaction[],
  today: Date,
  n = 6,
): Set<Category> {
  const months = recentMonths(transactions, today, n);
  const recurring = new Set<Category>();
  const majority = Math.ceil(months.length / 2);

  for (const c of CATEGORIES) {
    const presentCounts = months
      .map((m) => m.countByCategory[c])
      .filter((count) => count > 0);
    if (presentCounts.length >= majority && median(presentCounts) <= 1) {
      recurring.add(c);
    }
  }
  return recurring;
}

/** 외삽 제외 대상(고정지출)인가: isFixed 플래그 또는 반복결제 카테고리. */
function isFixedLike(t: Transaction, recurring: Set<Category>): boolean {
  return t.isFixed || recurring.has(t.category);
}

// ── 이력 충분성 (SPEC §6 함정 4) ───────────────────────────────────────────

/** 이번 달 이전에 거래가 존재하는 '서로 다른 달'의 개수. */
export function countHistoryMonths(
  transactions: Transaction[],
  today: Date,
): number {
  const currentKey = today.getFullYear() * 12 + today.getMonth();
  const months = new Set<number>();
  for (const t of transactions) {
    const key = t.date.getFullYear() * 12 + t.date.getMonth();
    if (key < currentKey) months.add(key);
  }
  return months.size;
}

/**
 * 분석을 시작해도 되는지 (함정 4).
 * 이력이 min(기본 3)개월 미만이면 중앙값·기준선이 전부 0이 되어 분석이 무의미하다.
 */
export function hasEnoughHistory(
  transactions: Transaction[],
  today: Date,
  min = 3,
): boolean {
  return countHistoryMonths(transactions, today) >= min;
}

// ── 월중 페이스 (SPEC §5-3) ────────────────────────────────────────────────

/**
 * 이번 달이 빡빡한지/여유로운지 월중에 판정한다.
 *
 * transactions: 과거 + 이번 달까지 전체 거래.
 * monthlyBudget: 이번 달 지출 예산.
 * today: 기준 시각(주입).
 */
export function analyzeMonthPace(params: {
  transactions: Transaction[];
  monthlyBudget: Won;
  today: Date;
  historyMonths?: number;
}): MonthPace {
  const { transactions, monthlyBudget: budget, today, historyMonths = 6 } = params;
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  const recurring = recurringCategories(transactions, today, historyMonths);
  const thisMonth = transactionsInMonth(transactions, year, month);

  // 이번 달 지출을 고정성/변동으로 분리 (함정 1: 반복결제는 고정성으로)
  let fixedSpent = 0;
  let variableSpent = 0;
  for (const t of thisMonth) {
    if (isFixedLike(t, recurring)) fixedSpent += t.amount;
    else variableSpent += t.amount;
  }
  const spentSoFar = fixedSpent + variableSpent;

  // 경과비율 = 경과일 / 그달 총일수
  const totalDays = daysInMonth(year, month);
  const elapsedDay = today.getDate();
  const elapsedRatio = elapsedDay / totalDays;

  // 예상 변동지출 = 현재 변동지출 / 경과비율 (변동만 외삽)
  const projectedVariable = Math.round(variableSpent / elapsedRatio);

  // 예상 고정지출 = max(이미 나간 고정, 과거 고정지출 중앙값)
  const historyFixedTotals = recentMonths(transactions, today, historyMonths).map(
    (m) => {
      // 그달의 고정성 지출 합계를 동일 기준으로 재계산
      const monthTx = transactionsInMonth(transactions, m.year, m.month);
      return monthTx.reduce(
        (sum, t) => (isFixedLike(t, recurring) ? sum + t.amount : sum),
        0,
      );
    },
  );
  const projectedFixed = Math.round(
    Math.max(fixedSpent, median(historyFixedTotals)),
  );

  const projectedTotal = projectedFixed + projectedVariable;

  // 함정 2: 변동지출로 쓸 수 있는 남은 예산과 하루 한도
  const allowableVariable = budget - projectedFixed;
  const remainingAllowable = allowableVariable - variableSpent;
  const remainingDays = Math.max(0, totalDays - elapsedDay);

  let overBudget: boolean;
  let dailyLimit: Won | null;
  let overAmount: Won;
  if (remainingAllowable <= 0) {
    // 이미 초과 — "하루 0원" 대신 초과 금액을 알려준다
    overBudget = true;
    dailyLimit = null;
    overAmount = Math.round(-remainingAllowable);
  } else {
    overBudget = false;
    overAmount = 0;
    dailyLimit =
      remainingDays > 0
        ? Math.round(remainingAllowable / remainingDays)
        : Math.round(remainingAllowable);
  }

  // 신호 판정 (SPEC §5-3 표)
  let signal: MonthPace["signal"];
  if (projectedTotal > budget * 1.05) signal = "tight";
  else if (projectedTotal < budget * 0.9) signal = "surplus";
  else signal = "ok";

  const message = buildPaceMessage({
    signal,
    overBudget,
    overAmount,
    projectedTotal,
    budget,
    dailyLimit,
  });

  return {
    signal,
    elapsedRatio,
    spentSoFar,
    projectedFixed,
    projectedVariable,
    projectedTotal,
    budget,
    overBudget,
    dailyLimit,
    overAmount,
    message,
  };
}

function buildPaceMessage(p: {
  signal: MonthPace["signal"];
  overBudget: boolean;
  overAmount: Won;
  projectedTotal: Won;
  budget: Won;
  dailyLimit: Won | null;
}): string {
  if (p.overBudget) {
    // 다그치지 않고 다음 행동을 제시 (CLAUDE.md 규칙 5)
    return `이미 예산을 ${format(p.overAmount)}원 초과했습니다. 다음 달 예산에서 조정됩니다.`;
  }
  if (p.signal === "tight") {
    return `이 페이스면 예산을 ${format(p.projectedTotal - p.budget)}원 초과할 것으로 보입니다. 남은 기간 하루 ${format(p.dailyLimit ?? 0)}원 이내로 쓰면 예산을 지킵니다.`;
  }
  if (p.signal === "surplus") {
    return `여유가 있습니다. 예상보다 ${format(p.budget - p.projectedTotal)}원 덜 쓸 것으로 보입니다.`;
  }
  return `정상 페이스입니다. 하루 ${format(p.dailyLimit ?? 0)}원 이내로 유지하면 됩니다.`;
}

/** 화면 표시가 아닌 문구 조립용 최소 포맷(원 단위 그룹핑). */
function format(won: Won): string {
  return Math.round(won).toLocaleString("ko-KR");
}

// ── 저축 여력 / 여유분 배분 (SPEC §5-3) ────────────────────────────────────

/**
 * 이번 달 예상 지출을 반영한 저축 가능액.
 * monthlyIncome − 예상 월말지출. 음수면 0으로 하한 처리.
 */
export function estimateAffordableSaving(
  monthlyIncome: Won,
  pace: MonthPace,
): Won {
  return Math.max(0, Math.round(monthlyIncome - pace.projectedTotal));
}

/**
 * surplus 여유분 자동 배분 (SPEC §5-3):
 * 비상금 부족분 우선 → 나머지를 목표 60% / 투자 40%.
 */
export function allocateSurplus(
  surplusAmount: Won,
  emergencyShortfall: Won,
): SurplusAllocation {
  const surplus = Math.max(0, surplusAmount);
  const toEmergency = Math.min(surplus, Math.max(0, emergencyShortfall));
  const rest = surplus - toEmergency;
  const toGoal = Math.round(rest * 0.6);
  // 반올림 누수 방지: 투자는 나머지를 그대로 받는다
  const toInvestment = rest - toGoal;
  return { toEmergency, toGoal, toInvestment };
}

// ── 카테고리 이상 탐지 (SPEC §5-4) ─────────────────────────────────────────

/** 알림 최소 편차 비율 30%. */
const ANOMALY_MIN_RATIO = 0.3;
/** 알림 최소 절대 편차 금액 3만원 — 소액 알림 스팸 방지. */
const ANOMALY_MIN_AMOUNT = 30_000;
/** 상위 노출 개수. */
const ANOMALY_TOP_N = 5;

/**
 * 이번 달 카테고리별 지출을 중앙값 기준선과 비교해 이상치를 탐지한다.
 * 조건: |편차| ≥ 30% AND |편차금액| ≥ 3만원. 편차 큰 순 상위 5개만.
 *
 * 통신·보험처럼 매달 같은 금액이 나가는 카테고리는 편차가 0에 가까워
 * 자연히 걸러진다(함정 1이 페이스뿐 아니라 이상 탐지에서도 방지됨).
 */
export function detectCategoryAnomalies(
  transactions: Transaction[],
  today: Date,
  n = 6,
): CategoryAnomaly[] {
  const baseline = categoryBaseline(transactions, today, n);
  const current = summarizeMonth(
    transactions,
    today.getFullYear(),
    today.getMonth() + 1,
  ).byCategory;

  const anomalies: CategoryAnomaly[] = [];
  for (const c of CATEGORIES) {
    const base = baseline[c];
    const cur = current[c];
    if (base <= 0) continue; // 기준선이 없으면 판정 보류

    const deviationAmount = cur - base;
    const deviationRatio = deviationAmount / base;
    if (
      Math.abs(deviationRatio) >= ANOMALY_MIN_RATIO &&
      Math.abs(deviationAmount) >= ANOMALY_MIN_AMOUNT
    ) {
      const label = CATEGORY_LABELS_KO[c];
      const pct = Math.abs(Math.round(deviationRatio * 100));
      const message =
        deviationAmount > 0
          ? `${label}이(가) 평소보다 ${pct}% 많습니다.`
          : `${label}이(가) 평소보다 ${pct}% 적습니다.`;
      anomalies.push({
        category: c,
        label,
        current: cur,
        baseline: base,
        deviationRatio,
        deviationAmount,
        message,
      });
    }
  }

  // 편차 금액이 큰 순으로 상위 N개
  return anomalies
    .sort((a, b) => Math.abs(b.deviationAmount) - Math.abs(a.deviationAmount))
    .slice(0, ANOMALY_TOP_N);
}

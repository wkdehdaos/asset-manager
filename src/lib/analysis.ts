/**
 * 서버 전용 분석 오케스트레이션: DB에서 로드 → core 순수 엔진 실행.
 * 여기서만 Prisma ↔ core 매핑이 일어나고, src/core는 Prisma를 모른다.
 */
import { prisma } from "@/lib/db";
import {
  diagnoseGoal,
  suggestAlternatives,
} from "@/core/goal-engine";
import {
  analyzeMonthPace,
  countHistoryMonths,
  detectCategoryAnomalies,
  estimateAffordableSaving,
  hasEnoughHistory,
} from "@/core/spending-analyzer";
import { calculateInvestmentCapacity } from "@/core/investment-advisor";
import { checkPreservationAll } from "@/core/purchasing-power";
import type {
  CategoryAnomaly,
  GoalDiagnosis,
  GoalInput,
  InvestmentCapacity,
  MonthPace,
  PreservationCheck,
  Transaction,
} from "@/core/types";

export interface DashboardData {
  title: string;
  goal: GoalInput;
  monthlyNet: number;
  monthlyBudget: number;
  progress: number; // 0~100
  diagnosis: GoalDiagnosis;
  alternatives: ReturnType<typeof suggestAlternatives> | null;
  preservation: PreservationCheck[];
  historyMonths: number;
  enoughHistory: boolean;
  // 이력이 충분할 때만 채워진다 (함정 4)
  pace: MonthPace | null;
  anomalies: CategoryAnomaly[];
  investment: InvestmentCapacity | null;
}

/** 대시보드에 필요한 모든 값을 계산한다. 목표/소득이 없으면 null(→온보딩 유도). */
export async function loadDashboard(
  today: Date = new Date(),
): Promise<DashboardData | null> {
  const user = await prisma.user.findFirst({
    include: {
      income: true,
      goals: { orderBy: { createdAt: "desc" } },
      accounts: true,
      transactions: true,
    },
  });

  const goalRow = user?.goals[0];
  if (!user || !user.income || !goalRow) return null;
  const income = user.income;

  // DB → core 순수 타입 매핑
  const transactions: Transaction[] = user.transactions.map((t) => ({
    date: t.date,
    amount: t.amount,
    category: t.category as Transaction["category"],
    isFixed: t.isFixed,
  }));

  const goal: GoalInput = {
    targetAmount: goalRow.targetAmount,
    targetDate: goalRow.targetDate,
    currentAssets: goalRow.currentAssets,
    expectedAnnualReturn: goalRow.expectedAnnualReturn,
  };

  // 예산 입력 필드는 아직 없어 실수령액의 80%를 임시 예산으로 가정
  const monthlyBudget = Math.round(income.monthlyNet * 0.8);

  const enoughHistory = hasEnoughHistory(transactions, today);
  const historyMonths = countHistoryMonths(transactions, today);

  let pace: MonthPace | null = null;
  let anomalies: CategoryAnomaly[] = [];
  let investment: InvestmentCapacity | null = null;
  // 저축여력: 이력이 있으면 지출 반영, 없으면 실수령액을 상한으로 사용
  let capacity = income.monthlyNet;

  if (enoughHistory) {
    pace = analyzeMonthPace({ transactions, monthlyBudget, today });
    anomalies = detectCategoryAnomalies(transactions, today);
    capacity = estimateAffordableSaving(income.monthlyNet, pace);
  }

  const diagnosis = diagnoseGoal(goal, capacity, today);

  if (enoughHistory && pace) {
    const liquidAssets = user.accounts
      .filter((a) => a.type !== "debt")
      .reduce((sum, a) => sum + a.balance, 0);
    investment = calculateInvestmentCapacity({
      liquidAssets,
      monthlyFixedExpense: pace.projectedFixed,
      monthlySaving: capacity,
      remainingMonths: diagnosis.months,
    });
  }

  const alternatives =
    diagnosis.feasibility.grade === "unrealistic" || !diagnosis.onTrack
      ? suggestAlternatives(goal, capacity, today)
      : null;

  const preservation = checkPreservationAll(goal.expectedAnnualReturn);

  const progress =
    goal.targetAmount > 0
      ? Math.min(100, (goal.currentAssets / goal.targetAmount) * 100)
      : 0;

  return {
    title: goalRow.title,
    goal,
    monthlyNet: income.monthlyNet,
    monthlyBudget,
    progress,
    diagnosis,
    alternatives,
    preservation,
    historyMonths,
    enoughHistory,
    pace,
    anomalies,
    investment,
  };
}

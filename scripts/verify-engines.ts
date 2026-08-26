/**
 * 시드 데이터로 STEP 1~3 엔진이 실제로 동작하는지 확인한다 (PROMPTS STEP 4).
 * DB → core Transaction 매핑 → 목표 진단 / 페이스 / 이상 탐지 / 투자 여력 출력.
 *
 * 실행: npm run verify
 */
import { PrismaClient } from "@prisma/client";
import { diagnoseGoal, suggestAlternatives } from "../src/core/goal-engine.js";
import {
  analyzeMonthPace,
  detectCategoryAnomalies,
  estimateAffordableSaving,
} from "../src/core/spending-analyzer.js";
import { calculateInvestmentCapacity } from "../src/core/investment-advisor.js";
import type { Transaction } from "../src/core/types.js";

const prisma = new PrismaClient();
const won = (n: number) => n.toLocaleString("ko-KR") + "원";

async function main() {
  // 이번 달 기준 시각 (시드가 2026-08까지라 27일로 고정해 결정론적으로 확인)
  const today = new Date(2026, 7, 27);

  const user = await prisma.user.findFirstOrThrow({
    include: { income: true, goals: true, accounts: true, transactions: true },
  });
  const income = user.income!;
  const goal = user.goals[0]!;

  // DB → core 순수 타입 매핑 (core는 Prisma를 모른다)
  const transactions: Transaction[] = user.transactions.map((t) => ({
    date: t.date,
    amount: t.amount,
    category: t.category as Transaction["category"],
    isFixed: t.isFixed,
  }));

  // 월 예산 = 실수령액의 80%로 가정 (데모용)
  const monthlyBudget = Math.round(income.monthlyNet * 0.8);

  console.log("=".repeat(60));
  console.log(`거래 ${transactions.length}건, 기준일 ${today.toLocaleDateString("ko-KR")}`);

  // ── STEP 2: 월중 페이스 ──
  const pace = analyzeMonthPace({ transactions, monthlyBudget, today });
  console.log("\n[월중 페이스]");
  console.log(`  신호: ${pace.signal}`);
  console.log(`  예상 월말지출: ${won(pace.projectedTotal)} (고정 ${won(pace.projectedFixed)} + 변동 ${won(pace.projectedVariable)})`);
  console.log(`  ${pace.message}`);

  // ── STEP 2: 카테고리 이상 탐지 ──
  const anomalies = detectCategoryAnomalies(transactions, today);
  console.log("\n[카테고리 이상 탐지]");
  if (anomalies.length === 0) console.log("  (이상 없음)");
  for (const a of anomalies) console.log(`  - ${a.message} (${won(a.baseline)} → ${won(a.current)})`);

  // ── STEP 1: 목표 진단 ──
  const capacity = estimateAffordableSaving(income.monthlyNet, pace);
  const diag = diagnoseGoal(
    {
      targetAmount: goal.targetAmount,
      targetDate: goal.targetDate,
      currentAssets: goal.currentAssets,
      expectedAnnualReturn: goal.expectedAnnualReturn,
    },
    capacity,
    today,
  );
  console.log("\n[목표 진단]");
  console.log(`  남은 기간: ${diag.months}개월, 월 저축여력: ${won(capacity)}`);
  console.log(`  필요 월 저축액: ${won(diag.requiredMonthlySaving)} (부족 ${won(diag.monthlyShortfall)})`);
  console.log(`  실현가능성: ${diag.feasibility.grade} — ${diag.feasibility.message}`);
  console.log(`  onTrack: ${diag.onTrack}`);

  if (diag.feasibility.grade === "unrealistic" || !diag.onTrack) {
    const alt = suggestAlternatives(
      {
        targetAmount: goal.targetAmount,
        targetDate: goal.targetDate,
        currentAssets: goal.currentAssets,
        expectedAnnualReturn: goal.expectedAnnualReturn,
      },
      capacity,
      today,
    );
    console.log("  대안:");
    console.log(`   · 기한연장: ${alt.extendDeadline.months}개월 (${alt.extendDeadline.newTargetDate?.toLocaleDateString("ko-KR")})`);
    console.log(`   · 목표축소: ${won(alt.reduceTarget.achievableAmount)}`);
    console.log(`   · 저축증액: 월 +${won(alt.increaseSaving.additionalPerMonth)}`);
  }

  // ── STEP 3: 투자 여력 ──
  const liquidAssets = user.accounts
    .filter((a) => a.type !== "debt")
    .reduce((s, a) => s + a.balance, 0);
  const monthlyFixedExpense = pace.projectedFixed;
  const invest = calculateInvestmentCapacity({
    liquidAssets,
    monthlyFixedExpense,
    monthlySaving: capacity,
    remainingMonths: diag.months,
  });
  console.log("\n[투자 여력]");
  console.log(`  성향: ${invest.profile.label} (안전 ${invest.profile.allocation.safe} / 채권 ${invest.profile.allocation.bonds} / 주식 ${invest.profile.allocation.stocks})`);
  console.log(`  비상금 목표: ${won(invest.emergencyTarget)}, 충족: ${invest.emergencyFunded}`);
  console.log(`  투자가능액: ${won(invest.investableAssets)}, 월 투자배정: ${won(invest.monthlyInvestment)}`);
  for (const w of invest.warnings) console.log(`  ⚠ ${w}`);
  console.log("=".repeat(60));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

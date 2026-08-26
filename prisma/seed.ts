/**
 * 시드 데이터: 최근 7개월(2026-01 ~ 2026-07) + 진행 중인 이번 달(2026-08, 27일까지).
 * STEP 1~3 엔진이 실제 DB 데이터로 동작하는지 확인하는 토대다.
 *
 * 의도적으로 심은 패턴:
 * - 통신 55,000 / 보험 120,000: 매달 1건씩 월초 결제 → 반복결제(함정 1 검증용)
 * - 이번 달(8월)만 외식비 2배 → 카테고리 이상 탐지 검증용
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface TxSeed {
  year: number;
  month: number; // 1~12
  day: number;
  amount: number;
  category: string;
  isFixed: boolean;
}

function monthTransactions(year: number, month: number, diningTotal: number): TxSeed[] {
  const f = (day: number, amount: number, category: string, isFixed: boolean): TxSeed => ({
    year, month, day, amount, category, isFixed,
  });
  const diningEach = Math.round(diningTotal / 4);
  return [
    // 고정성 지출 (월초에 몰림)
    f(1, 700_000, "housing", true),
    f(3, 120_000, "insurance", false), // isFixed 안 붙여도 반복결제로 잡히는지 확인
    f(5, 55_000, "communication", false),
    f(2, 15_000, "subscription", true),
    // 변동 지출 (분산)
    f(6, diningEach, "dining", false),
    f(13, diningEach, "dining", false),
    f(20, diningEach, "dining", false),
    f(27, diningTotal - diningEach * 3, "dining", false),
    f(8, 100_000, "food", false),
    f(16, 100_000, "food", false),
    f(24, 100_000, "food", false),
    f(10, 60_000, "transport", false),
    f(18, 45_000, "utilities", false),
  ];
}

async function main() {
  // 멱등성: 기존 데이터 정리
  await prisma.transaction.deleteMany();
  await prisma.account.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.incomeProfile.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: {
      email: "demo@example.com",
      income: {
        create: { monthlyNet: 3_500_000, annualBonus: 5_000_000, otherIncome: 0 },
      },
      goals: {
        create: {
          title: "3년 내 1억 만들기",
          targetAmount: 100_000_000,
          targetDate: new Date(2029, 0, 1),
          currentAssets: 20_000_000,
          expectedAnnualReturn: 0.05,
        },
      },
      accounts: {
        create: [
          { type: "deposit", name: "주거래 통장", balance: 15_000_000 },
          { type: "investment", name: "증권 계좌", balance: 5_000_000 },
          { type: "debt", name: "마이너스 통장", balance: 0 },
        ],
      },
    },
  });

  // 최근 7개월: 외식 평소 200,000
  const seeds: TxSeed[] = [];
  for (let m = 1; m <= 7; m++) {
    seeds.push(...monthTransactions(2026, m, 200_000));
  }
  // 이번 달(8월, 27일까지): 외식 2배(400,000), 고정성은 이미 월초 결제됨
  for (const t of monthTransactions(2026, 8, 400_000)) {
    if (t.day <= 27) seeds.push(t);
  }

  await prisma.transaction.createMany({
    data: seeds.map((t) => ({
      userId: user.id,
      date: new Date(t.year, t.month - 1, t.day),
      amount: t.amount,
      category: t.category,
      isFixed: t.isFixed,
    })),
  });

  console.log(
    `시드 완료: user=${user.email}, 거래 ${seeds.length}건 (2026-01 ~ 2026-08).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

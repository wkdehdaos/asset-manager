"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { loadDashboard } from "@/lib/analysis";
import {
  buildCoachFacts,
  generateCoaching,
  type CoachResult,
} from "@/server/ai-coach";
import { transactionKey } from "@/core/csv-import";

/** 단일 사용자 데모 앱 — 고정 이메일로 upsert. 추후 인증 붙일 자리. */
const DEMO_EMAIL = "demo@example.com";

async function currentUserId(): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL },
  });
  return user.id;
}

export interface OnboardingInput {
  monthlyNet: number;
  annualBonus: number;
  targetAmount: number;
  targetDate: string; // YYYY-MM-DD
  currentAssets: number;
  expectedAnnualReturn: number; // 소수
  title: string;
}

/** 온보딩 저장: 소득 프로필 + 목표. 저장 후 대시보드로. */
export async function saveOnboarding(input: OnboardingInput): Promise<void> {
  const userId = await currentUserId();

  await prisma.incomeProfile.upsert({
    where: { userId },
    update: { monthlyNet: input.monthlyNet, annualBonus: input.annualBonus },
    create: {
      userId,
      monthlyNet: input.monthlyNet,
      annualBonus: input.annualBonus,
    },
  });

  // MVP: 목표는 하나만 유지 (다중 목표는 v2)
  await prisma.goal.deleteMany({ where: { userId } });
  await prisma.goal.create({
    data: {
      userId,
      title: input.title || "목표",
      targetAmount: input.targetAmount,
      targetDate: new Date(input.targetDate),
      currentAssets: input.currentAssets,
      expectedAnnualReturn: input.expectedAnnualReturn,
    },
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export interface TransactionInput {
  date: string; // YYYY-MM-DD
  amount: number;
  category: string;
  isFixed: boolean;
  memo?: string;
}

/** 거래 추가. 대시보드 분석에 즉시 반영되도록 revalidate. */
export async function addTransaction(input: TransactionInput): Promise<void> {
  const userId = await currentUserId();
  await prisma.transaction.create({
    data: {
      userId,
      date: new Date(input.date),
      amount: Math.round(input.amount),
      category: input.category,
      isFixed: input.isFixed,
      memo: input.memo?.trim() || null,
    },
  });
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}

/** AI 코칭 리포트 생성 (온디맨드). 키가 없거나 실패하면 규칙 기반 폴백. */
export async function getCoaching(): Promise<CoachResult> {
  const data = await loadDashboard();
  if (!data) {
    return { text: "목표를 먼저 설정해 주세요.", source: "fallback" };
  }
  return generateCoaching(buildCoachFacts(data));
}

export interface ImportRow {
  date: string; // YYYY-MM-DD
  amount: number;
  category: string;
  memo?: string;
}

/**
 * CSV 임포트: 기존 거래(날짜+금액)와 중복되는 행은 건너뛰고 나머지만 저장.
 * 배치 내 중복도 함께 제거한다.
 */
export async function importTransactions(
  rows: ImportRow[],
): Promise<{ inserted: number; skipped: number }> {
  const userId = await currentUserId();
  const existing = await prisma.transaction.findMany({
    where: { userId },
    select: { date: true, amount: true },
  });
  const seen = new Set(existing.map((t) => transactionKey(t.date, t.amount)));

  const toCreate: {
    userId: string;
    date: Date;
    amount: number;
    category: string;
    isFixed: boolean;
    memo: string | null;
  }[] = [];
  let skipped = 0;

  for (const r of rows) {
    const date = new Date(r.date);
    if (Number.isNaN(date.getTime())) {
      skipped++;
      continue;
    }
    const key = transactionKey(date, r.amount);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    toCreate.push({
      userId,
      date,
      amount: Math.round(r.amount),
      category: r.category,
      isFixed: false,
      memo: r.memo?.trim() || null,
    });
  }

  if (toCreate.length > 0) {
    await prisma.transaction.createMany({ data: toCreate });
  }
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { inserted: toCreate.length, skipped };
}

/** 거래 삭제. */
export async function deleteTransaction(id: string): Promise<void> {
  await prisma.transaction.delete({ where: { id } });
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}

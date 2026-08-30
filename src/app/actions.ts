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
import {
  computeRoadmapProgress,
  type RoadmapProgress,
} from "@/core/roadmap";
import {
  DEFAULT_PLAN,
  FINAL_GOAL,
  GROUP_MONTH,
  PLAN_CATEGORY_ORDER,
  type PlanCategory,
} from "@/lib/roadmap-data";
import { computePortfolio } from "@/core/portfolio";
import { buildYear, type MonthStatus } from "@/core/monthly";

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

  revalidatePath("/roadmap");
  redirect("/roadmap");
}

export interface TransactionInput {
  date: string; // YYYY-MM-DD
  amount: number;
  category: string;
  isFixed: boolean;
  memo?: string;
  /** expense | income. 생략 시 지출. */
  direction?: "expense" | "income";
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
      direction: input.direction ?? "expense",
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
  /** expense | income. 생략 시 지출 (기존 카드 CSV 임포트 호환). */
  direction?: "expense" | "income";
  isFixed?: boolean;
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
    select: { date: true, amount: true, direction: true },
  });
  // 중복 키에 방향을 포함 — 같은 날 같은 금액이라도 입금·지출은 별개 거래다.
  const dedupKey = (date: Date, amount: number, direction: string) =>
    `${direction}|${transactionKey(date, amount)}`;
  const seen = new Set(
    existing.map((t) => dedupKey(t.date, t.amount, t.direction)),
  );

  const toCreate: {
    userId: string;
    date: Date;
    amount: number;
    category: string;
    direction: string;
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
    const direction = r.direction ?? "expense";
    const key = dedupKey(date, r.amount, direction);
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
      direction,
      isFixed: r.isFixed ?? false,
      memo: r.memo?.trim() || null,
    });
  }

  if (toCreate.length > 0) {
    await prisma.transaction.createMany({ data: toCreate });
  }

  // 카테고리 학습: 이번에 저장한 지출의 (내용 → 카테고리)를 규칙으로 기억한다.
  // 다음 임포트에서 같은 내용은 자동으로 이 카테고리가 적용된다 (최신 선택이 규칙을 덮어씀).
  const rules = new Map<string, string>();
  for (const t of toCreate) {
    const pattern = t.memo?.trim();
    if (t.direction === "expense" && pattern) rules.set(pattern, t.category);
  }
  if (rules.size > 0) {
    await prisma.$transaction(
      [...rules].map(([pattern, category]) =>
        prisma.categoryRule.upsert({
          where: { userId_pattern: { userId, pattern } },
          update: { category },
          create: { userId, pattern, category },
        }),
      ),
    );
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { inserted: toCreate.length, skipped };
}

/** 학습된 카테고리 규칙을 내용→카테고리 맵으로 반환 (임포트 미리보기에서 자동 적용용). */
export async function getCategoryRules(): Promise<Record<string, string>> {
  const userId = await currentUserId();
  const rules = await prisma.categoryRule.findMany({
    where: { userId },
    select: { pattern: true, category: true },
  });
  return Object.fromEntries(rules.map((r) => [r.pattern, r.category]));
}

// ── 로드맵 (1억 프로젝트 계획표) ────────────────────────────────────────────

export interface RoadmapTaskGroup {
  group: string;
  /** 연월 키(YYYYMM) — 미래 달 숨김 판정용. */
  monthKey: number;
  items: {
    id: string;
    title: string;
    done: boolean;
    category: PlanCategory;
  }[];
}

export interface RoadmapView {
  progress: RoadmapProgress;
  taskGroups: RoadmapTaskGroup[];
  /** 클라이언트 라이브 재계산용 (체크 시 즉시 % 반영). */
  finalGoal: number;
  currentAssets: number;
}

/**
 * 로드맵 조회. PlanItem이 없으면 기본 계획서(roadmap-data)를 시드한 뒤 진행률을 계산한다.
 * 진행률 계산은 core(computeRoadmapProgress)가 담당 — 여기선 DB 매핑만 (CLAUDE.md 규칙 1).
 */
export async function getRoadmap(): Promise<RoadmapView> {
  const userId = await currentUserId();

  let items = await prisma.planItem.findMany({
    where: { userId },
    orderBy: { order: "asc" },
  });

  if (items.length === 0) {
    await prisma.planItem.createMany({
      data: DEFAULT_PLAN.map((p, i) => ({
        userId,
        key: p.key,
        kind: p.kind,
        group: p.group,
        label: p.label ?? null,
        title: p.title,
        targetAmount: p.targetAmount ?? null,
        order: i,
        done: p.done ?? false,
        doneAt: p.done ? new Date() : null,
      })),
    });
    items = await prisma.planItem.findMany({
      where: { userId },
      orderBy: { order: "asc" },
    });
  }

  // 현재 자산 — 포트폴리오(보유자산) 총액. 마일스톤 '도달 가능' 표시에 쓴다.
  const holdings = await prisma.holding.findMany({
    where: { userId },
    select: { amount: true },
  });
  const currentAssets = holdings.reduce((sum, h) => sum + h.amount, 0);

  const milestones = items
    .filter((i) => i.kind === "milestone")
    .map((i) => ({
      id: i.id,
      label: i.label ?? "",
      title: i.title,
      targetAmount: i.targetAmount ?? 0,
      done: i.done,
    }));
  const progress = computeRoadmapProgress(milestones, FINAL_GOAL, currentAssets);

  // 항목 key → 카테고리 (roadmap-data 기준). DB에 저장 안 하고 여기서 조인.
  const catByKey = new Map<string, PlanCategory>(
    DEFAULT_PLAN.filter((p) => p.category).map((p) => [p.key, p.category!]),
  );
  const catOrder = (c: PlanCategory) => PLAN_CATEGORY_ORDER.indexOf(c);

  const taskGroups: RoadmapTaskGroup[] = [];
  for (const t of items.filter((i) => i.kind === "task")) {
    let g = taskGroups.find((x) => x.group === t.group);
    if (!g) {
      g = { group: t.group, monthKey: GROUP_MONTH[t.group] ?? 0, items: [] };
      taskGroups.push(g);
    }
    g.items.push({
      id: t.id,
      title: t.title,
      done: t.done,
      category: catByKey.get(t.key) ?? "admin",
    });
  }
  // 월 안에서 같은 카테고리끼리 묶이도록 카테고리 순으로 정렬.
  for (const g of taskGroups) {
    g.items.sort((a, b) => catOrder(a.category) - catOrder(b.category));
  }

  // 아직 안 온 달은 제외 — 그 달(연월)이 되면 다음 방문부터 자동으로 나타난다.
  // 계획 시작 전(도래한 달이 없음)이면 첫 달만 미리 보여준다.
  const now = new Date();
  const nowKey = now.getFullYear() * 100 + (now.getMonth() + 1);
  const arrivedGroups = taskGroups.filter((g) => g.monthKey <= nowKey);
  const visibleGroups = arrivedGroups.length
    ? arrivedGroups
    : taskGroups.slice(0, 1);

  return {
    progress,
    taskGroups: visibleGroups,
    finalGoal: FINAL_GOAL,
    currentAssets,
  };
}

// ── 포트폴리오 (현재 자산) ──────────────────────────────────────────────────

export interface PortfolioView {
  total: number;
  slices: { assetClass: string; amount: number; percent: number }[];
  holdings: { id: string; name: string; assetClass: string; amount: number }[];
}

/** 포트폴리오 조회 — 보유자산 목록 + 자산군별 비중(core computePortfolio). */
export async function getPortfolio(): Promise<PortfolioView> {
  const userId = await currentUserId();
  const rows = await prisma.holding.findMany({
    where: { userId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  const { total, slices } = computePortfolio(
    rows.map((r) => ({ assetClass: r.assetClass, amount: r.amount })),
  );
  return {
    total,
    slices,
    holdings: rows.map((r) => ({
      id: r.id,
      name: r.name,
      assetClass: r.assetClass,
      amount: r.amount,
    })),
  };
}

export interface HoldingInput {
  name: string;
  assetClass: string;
  amount: number;
}

/** 보유자산 추가. 포트폴리오·로드맵(현재자산) 갱신. */
export async function addHolding(input: HoldingInput): Promise<void> {
  const userId = await currentUserId();
  const amount = Math.max(0, Math.round(input.amount));
  await prisma.holding.create({
    data: {
      userId,
      name: input.name.trim() || "자산",
      assetClass: input.assetClass,
      amount,
    },
  });
  revalidatePath("/portfolio");
  revalidatePath("/roadmap");
}

/** 보유자산 삭제. */
export async function deleteHolding(id: string): Promise<void> {
  const userId = await currentUserId();
  await prisma.holding.deleteMany({ where: { id, userId } });
  revalidatePath("/portfolio");
  revalidatePath("/roadmap");
}

// ── 월별 로드맵 (Monthly Overview) ─────────────────────────────────────────

export interface MonthlyCellView {
  year: number;
  month: number;
  ym: number;
  savingTarget: number;
  cumulative: number;
  status: MonthStatus;
  dDay: number;
  /** 이 달의 계획 그룹 라벨 (없으면 null). */
  group: string | null;
  taskDone: number;
  taskTotal: number;
  tasks: {
    id: string;
    title: string;
    done: boolean;
    category: PlanCategory;
  }[];
}

export interface MonthlyPlanView {
  year: number;
  /** 연도 탭 목록. */
  years: number[];
  cells: MonthlyCellView[];
}

/**
 * 월별 로드맵 조회 — 해당 연도 12개월 + 각 달 할 일.
 * year 미지정 시 실제 자산 기준 '현재 진행 중'인 달의 연도를 기본으로.
 */
export async function getMonthlyPlan(
  yearArg?: number,
): Promise<MonthlyPlanView> {
  const userId = await currentUserId();

  // PlanItem이 없으면 시드 (roadmap과 공유). getRoadmap이 시드하지만 직접 진입 대비.
  const existing = await prisma.planItem.count({ where: { userId } });
  if (existing === 0) await getRoadmap();

  // 실제 포트폴리오 총액 — 누적·상태 판정의 기준.
  const holdingRows = await prisma.holding.findMany({
    where: { userId },
    select: { amount: true },
  });
  const actualAssets = holdingRows.reduce((s, h) => s + h.amount, 0);
  // 기본 연도 = 실제 올해 (현재 달이 그 안에 있도록).
  const year = yearArg ?? new Date().getFullYear();

  const items = await prisma.planItem.findMany({
    where: { userId, kind: "task" },
    orderBy: { order: "asc" },
  });
  const catByKey = new Map<string, PlanCategory>(
    DEFAULT_PLAN.filter((p) => p.category).map((p) => [p.key, p.category!]),
  );

  // 연월(ym) → 그 달 할 일들.
  const tasksByYm = new Map<
    number,
    { group: string; tasks: MonthlyCellView["tasks"] }
  >();
  for (const t of items) {
    const ym = GROUP_MONTH[t.group];
    if (!ym) continue;
    let bucket = tasksByYm.get(ym);
    if (!bucket) {
      bucket = { group: t.group, tasks: [] };
      tasksByYm.set(ym, bucket);
    }
    bucket.tasks.push({
      id: t.id,
      title: t.title,
      done: t.done,
      category: catByKey.get(t.key) ?? "admin",
    });
  }

  const cells: MonthlyCellView[] = buildYear(year, actualAssets, new Date()).map(
    (c) => {
    const bucket = tasksByYm.get(c.ym);
    const tasks = bucket?.tasks ?? [];
    return {
      ...c,
      group: bucket?.group ?? null,
      taskDone: tasks.filter((t) => t.done).length,
      taskTotal: tasks.length,
      tasks,
    };
  });

  // 연도 탭 = 계획에 등장하는 연도들.
  const years = [
    ...new Set(Object.values(GROUP_MONTH).map((v) => Math.floor(v / 100))),
  ].sort((a, b) => a - b);

  return { year, years, cells };
}

/** 로드맵 항목(마일스톤/체크리스트) 달성 토글. */
export async function togglePlanItem(id: string, done: boolean): Promise<void> {
  const userId = await currentUserId();
  await prisma.planItem.updateMany({
    where: { id, userId },
    data: { done, doneAt: done ? new Date() : null },
  });
  revalidatePath("/roadmap");
}

/** 거래 삭제. */
export async function deleteTransaction(id: string): Promise<void> {
  await prisma.transaction.delete({ where: { id } });
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}

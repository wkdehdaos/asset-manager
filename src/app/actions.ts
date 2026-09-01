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
import { marketValueKrw, dailyChangePct } from "@/core/holding-valuation";
import { buildYear, monthlySaving, type MonthStatus } from "@/core/monthly";
import {
  fetchQuotes,
  fetchUsdKrw,
  normalizeTicker,
  type Quote,
} from "@/server/market-data";
import {
  extractHoldingsFromImage as runVision,
  type VisionResult,
} from "@/server/asset-vision";
import Anthropic from "@anthropic-ai/sdk";

export type { VisionResult, ExtractedHolding } from "@/server/asset-vision";

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
    /** 이 할 일에 걸린 금액(원). 없으면 undefined. */
    amount?: number;
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

  // 항목 key → 카테고리·금액 (roadmap-data 기준). DB에 저장 안 하고 여기서 조인.
  const catByKey = new Map<string, PlanCategory>(
    DEFAULT_PLAN.filter((p) => p.category).map((p) => [p.key, p.category!]),
  );
  const amountByKey = new Map<string, number>(
    DEFAULT_PLAN.filter((p) => p.amount).map((p) => [p.key, p.amount!]),
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
      category:
        catByKey.get(t.key) ?? (t.category as PlanCategory | null) ?? "admin",
      amount: amountByKey.get(t.key),
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

export interface PortfolioHoldingView {
  id: string;
  name: string;
  assetClass: string;
  amount: number;
  /** 실시간 종목이면 야후 심볼, 아니면 null. */
  ticker: string | null;
  /** 보유 수량 (실시간 종목만). */
  quantity: number | null;
  /** 시세 통화 (실시간 종목만). */
  currency: string | null;
  /** 마지막 시세 갱신 시각(ISO). 실시간 배지·표시에 쓴다. */
  pricedAt: string | null;
  /** 1주(개)당 현재가(원). 평가액÷수량. 수동 자산은 null. */
  unitPriceKrw: number | null;
  /** 전일대비 등락률(%). 없으면 null. */
  changePct: number | null;
}

export interface PortfolioView {
  total: number;
  slices: { assetClass: string; amount: number; percent: number }[];
  holdings: PortfolioHoldingView[];
  /** 실시간(티커 보유) 종목이 하나라도 있는가 — 새로고침 버튼 노출 판정. */
  hasLive: boolean;
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
    hasLive: rows.some((r) => r.ticker),
    holdings: rows.map((r) => ({
      id: r.id,
      name: r.name,
      assetClass: r.assetClass,
      amount: r.amount,
      ticker: r.ticker,
      quantity: r.quantity,
      currency: r.currency,
      pricedAt: r.pricedAt?.toISOString() ?? null,
      unitPriceKrw:
        r.ticker && r.quantity && r.quantity > 0
          ? Math.round(r.amount / r.quantity)
          : null,
      changePct: r.changePct,
    })),
  };
}

/** 시세 통화를 원화로 바꾸는 환율. KRW=1, USD=주입된 환율, 그 외·환율없음=null(환산불가). */
function fxToKrw(currency: string, usdKrw: number | null): number | null {
  if (currency === "KRW") return 1;
  if (currency === "USD") return usdKrw;
  return null;
}

/** 시세로 원화 평가액 + 전일대비 등락률 계산. 환산 불가면 null. */
function valueFromQuote(
  quantity: number,
  quote: Quote,
  usdKrw: number | null,
): { amount: number; changePct: number | null } | null {
  const fx = fxToKrw(quote.currency, usdKrw);
  if (fx === null) return null;
  return {
    amount: marketValueKrw(quantity, quote.price, fx),
    changePct: dailyChangePct(quote.price, quote.previousClose),
  };
}

export interface HoldingInput {
  name: string;
  assetClass: string;
  /** 수동 입력 평가금액(원). 실시간 종목이면 무시하고 시세로 계산한다. */
  amount: number;
  /** 실시간 종목이면 야후 심볼(예: 005930.KS, AAPL). */
  ticker?: string;
  /** 실시간 종목이면 보유 수량. */
  quantity?: number;
}

/**
 * 보유자산 추가. 티커+수량이 있으면 즉시 시세를 조회해 평가액을 계산·캐시한다.
 * 시세 조회에 실패해도 저장은 진행(수동 금액으로 폴백) — 다음 새로고침에서 갱신된다.
 */
export async function addHolding(input: HoldingInput): Promise<void> {
  const userId = await currentUserId();

  const ticker = input.ticker?.trim()
    ? normalizeTicker(input.ticker, input.assetClass)
    : null;
  const quantity =
    ticker && Number.isFinite(input.quantity) && (input.quantity ?? 0) > 0
      ? input.quantity!
      : null;

  let amount = Math.max(0, Math.round(input.amount));
  let currency: string | null = null;
  let pricedAt: Date | null = null;
  let changePct: number | null = null;

  if (ticker && quantity) {
    const [quotes, usdKrw] = await Promise.all([
      fetchQuotes([ticker]),
      fetchUsdKrw(),
    ]);
    const quote = quotes.get(ticker);
    if (quote) {
      const valued = valueFromQuote(quantity, quote, usdKrw);
      if (valued !== null) {
        amount = valued.amount;
        currency = quote.currency;
        pricedAt = new Date();
        changePct = valued.changePct;
      }
    }
  }

  await prisma.holding.create({
    data: {
      userId,
      name: input.name.trim() || "자산",
      assetClass: input.assetClass,
      amount,
      ticker,
      quantity,
      currency,
      pricedAt,
      changePct,
    },
  });
  revalidatePath("/portfolio");
  revalidatePath("/roadmap");
}

/**
 * 실시간 종목 시세 새로고침. 티커가 있는 보유자산의 평가액을 다시 계산해 저장한다.
 * 시세를 못 가져온 종목은 기존 값을 유지한다(앱은 계속 동작 — SPEC §원칙4 동일 정신).
 */
export async function refreshPrices(): Promise<{
  updated: number;
  at: string;
}> {
  const userId = await currentUserId();
  const live = await prisma.holding.findMany({
    where: { userId, ticker: { not: null } },
    select: { id: true, ticker: true, quantity: true },
  });
  if (live.length === 0) return { updated: 0, at: new Date().toISOString() };

  const tickers = live.map((h) => h.ticker!).filter(Boolean);
  const needsFx = true; // USD 종목이 있을 수 있으니 항상 확보 시도(캐시되어 저렴).
  const [quotes, usdKrw] = await Promise.all([
    fetchQuotes(tickers),
    needsFx ? fetchUsdKrw() : Promise.resolve(null),
  ]);

  const now = new Date();
  let updated = 0;
  const updates = [];
  for (const h of live) {
    if (!h.ticker || !h.quantity) continue;
    const quote = quotes.get(h.ticker);
    if (!quote) continue;
    const valued = valueFromQuote(h.quantity, quote, usdKrw);
    if (valued === null) continue;
    updated++;
    updates.push(
      prisma.holding.update({
        where: { id: h.id },
        data: {
          amount: valued.amount,
          currency: quote.currency,
          pricedAt: now,
          changePct: valued.changePct,
        },
      }),
    );
  }
  if (updates.length > 0) await prisma.$transaction(updates);

  revalidatePath("/portfolio");
  revalidatePath("/roadmap");
  return { updated, at: now.toISOString() };
}

/** 보유자산 삭제. */
export async function deleteHolding(id: string): Promise<void> {
  const userId = await currentUserId();
  await prisma.holding.deleteMany({ where: { id, userId } });
  revalidatePath("/portfolio");
  revalidatePath("/roadmap");
}

/** 사진에서 보유자산 후보 추출 (저장 안 함 — 미리보기용). */
export async function extractHoldingsFromImage(
  dataUrl: string,
): Promise<VisionResult> {
  return runVision(dataUrl);
}

/**
 * 보유자산 여러 건 일괄 저장 (사진 미리보기 확인 후). 티커+수량이 있는 행은
 * 시세를 한 번에 조회해 실시간 평가액으로 저장한다. 한 번만 revalidate.
 */
export async function addHoldingsBatch(rows: HoldingInput[]): Promise<number> {
  const userId = await currentUserId();
  if (rows.length === 0) return 0;

  // 실시간 대상(티커+수량) 행을 추려 시세·환율을 한 번에 확보.
  const prepared = rows.map((r) => {
    const ticker = r.ticker?.trim()
      ? normalizeTicker(r.ticker, r.assetClass)
      : null;
    const quantity =
      ticker && Number.isFinite(r.quantity) && (r.quantity ?? 0) > 0
        ? r.quantity!
        : null;
    return { r, ticker, quantity };
  });
  const liveTickers = prepared
    .filter((p) => p.ticker && p.quantity)
    .map((p) => p.ticker!);

  let quotes = new Map<string, Quote>();
  let usdKrw: number | null = null;
  if (liveTickers.length > 0) {
    [quotes, usdKrw] = await Promise.all([
      fetchQuotes(liveTickers),
      fetchUsdKrw(),
    ]);
  }

  const now = new Date();
  const data = prepared.map(({ r, ticker, quantity }) => {
    let amount = Math.max(0, Math.round(r.amount));
    let currency: string | null = null;
    let pricedAt: Date | null = null;
    let changePct: number | null = null;
    if (ticker && quantity) {
      const quote = quotes.get(ticker);
      if (quote) {
        const valued = valueFromQuote(quantity, quote, usdKrw);
        if (valued !== null) {
          amount = valued.amount;
          currency = quote.currency;
          pricedAt = now;
          changePct = valued.changePct;
        }
      }
    }
    return {
      userId,
      name: r.name.trim() || "자산",
      assetClass: r.assetClass,
      amount,
      ticker,
      quantity,
      currency,
      pricedAt,
      changePct,
    };
  });

  await prisma.holding.createMany({ data });
  revalidatePath("/portfolio");
  revalidatePath("/roadmap");
  return data.length;
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
  // 저축 목표 재정의(AI 은행원/사용자 조정분) 로드.
  const ovRows = await prisma.savingOverride.findMany({
    where: { userId },
    select: { monthKey: true, amount: true },
  });
  const overrides: Record<number, number> = Object.fromEntries(
    ovRows.map((o) => [o.monthKey, o.amount]),
  );
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
      category:
        catByKey.get(t.key) ?? (t.category as PlanCategory | null) ?? "admin",
    });
  }

  const cells: MonthlyCellView[] = buildYear(
    year,
    actualAssets,
    new Date(),
    overrides,
  ).map((c) => {
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

// ── AI 은행원 (대화형 계획 조정) ────────────────────────────────────────────

export interface BankerMessage {
  role: "user" | "assistant";
  content: string;
}

export interface BankerReply {
  reply: string;
  /** 이번 턴에 실제로 실행한 조정 내역 (사람이 읽는 문장). */
  actions: string[];
}

const BANKER_SYSTEM = `당신은 '2030년 1억 모으기' 자산관리 앱의 AI 은행원 '머니'입니다.
- 친근하고 다정한 존댓말 톤(카카오뱅크 느낌). 이모지를 적당히 쓰고, 어려운 전문용어 대신 쉬운 말로 요약합니다.
- 사용자가 수입/지출 변화나 계획 변경을 말하면 공감하고, 필요한 조정을 '도구'로 실제 반영하세요.
  · 특정 달 저축 목표를 바꾸려면 adjust_month_saving 도구를 호출.
  · 새 할 일(미션)을 추가하려면 add_task 도구를 호출. group은 반드시 [현재 계획]의 계획월목록 label 중 하나여야 합니다.
- 도구를 부른 뒤에는 무엇을 바꿨는지 한두 문장으로 알려주고, 도움이 될 다음 제안을 덧붙이세요.
- 금융/서류/조건 질문(예: 청년미래적금·장병내일적금 가입조건, 우대금리, 정부지원 등)에는 성실히 답하세요.
  최신·정확한 정보가 필요하면 web_search 도구로 직접 검색해서 근거를 찾아 답하고, 출처(은행/기관)를 간단히 언급하세요.
  제도·금리·조건은 바뀔 수 있으니 "정확한 최신 조건은 해당 은행·공고에서 확인"을 덧붙이세요.
- 금융 가드레일: 새로운 특정 종목·투자상품·코인을 '추천'하지는 마세요(자산군 수준까지만). 단, 사용자가 이미 진행 중인 상품(청미적·장병내일 등)의 조건 설명은 괜찮습니다. 투자를 언급하면 원금 손실 가능성을 함께 알리고, 사용자를 다그치지 말고 다음 행동을 제시하세요.
- 금액·비율 계산은 앱이 하니 [현재 계획]의 숫자를 근거로 쓰세요.
- 답변은 3~6문장, 마크다운·머리말 없이 본문만.`;

const BANKER_TOOLS: Anthropic.Tool[] = [
  {
    name: "adjust_month_saving",
    description:
      "특정 달의 월 저축 목표 금액(원)을 변경한다. 수입 변화 등으로 저축액을 조정할 때 사용.",
    input_schema: {
      type: "object",
      properties: {
        monthKey: { type: "number", description: "연월 YYYYMM (예: 202609)" },
        amount: { type: "number", description: "새 월 저축 목표 금액(원)" },
      },
      required: ["monthKey", "amount"],
    },
  },
  {
    name: "add_task",
    description: "특정 달에 새 할 일(미션)을 추가한다.",
    input_schema: {
      type: "object",
      properties: {
        group: {
          type: "string",
          description: "월 라벨. 반드시 [현재 계획] 계획월목록의 label 중 하나",
        },
        title: { type: "string", description: "할 일 내용" },
        category: {
          type: "string",
          enum: ["income", "saving", "investment", "setup", "growth", "admin"],
          description: "분류: income 수입, saving 저축, investment 투자, setup 가입·세팅, growth 자기계발, admin 준비·서류",
        },
      },
      required: ["group", "title", "category"],
    },
  },
];

/** 도구 실행 → DB 수정. 성공 시 사람이 읽는 문장 반환. */
async function runBankerTool(
  userId: string,
  name: string,
  input: Record<string, unknown>,
): Promise<{ ok: boolean; message: string }> {
  if (name === "adjust_month_saving") {
    const monthKey = Number(input.monthKey);
    const amount = Math.max(0, Math.round(Number(input.amount)));
    if (!Number.isFinite(monthKey) || !Number.isFinite(amount)) {
      return { ok: false, message: "월 또는 금액 값이 올바르지 않아요." };
    }
    await prisma.savingOverride.upsert({
      where: { userId_monthKey: { userId, monthKey } },
      update: { amount },
      create: { userId, monthKey, amount },
    });
    const m = monthKey % 100;
    return {
      ok: true,
      message: `${m}월 저축 목표를 ${amount.toLocaleString("ko-KR")}원으로 변경했어요.`,
    };
  }
  if (name === "add_task") {
    const group = String(input.group ?? "").trim();
    const title = String(input.title ?? "").trim();
    const category = String(input.category ?? "admin");
    if (!(group in GROUP_MONTH)) {
      return {
        ok: false,
        message: `'${group}'은 계획월 목록에 없어요. 유효한 달을 골라주세요.`,
      };
    }
    if (!title) return { ok: false, message: "할 일 내용이 비어 있어요." };
    const last = await prisma.planItem.findFirst({
      where: { userId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    await prisma.planItem.create({
      data: {
        userId,
        key: `ai-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        kind: "task",
        group,
        category,
        title,
        order: (last?.order ?? 0) + 1,
        done: false,
      },
    });
    return { ok: true, message: `${group}에 '${title}' 할 일을 추가했어요.` };
  }
  return { ok: false, message: `알 수 없는 도구: ${name}` };
}

/** AI 은행원과 대화. 도구 호출로 실제 계획을 조정한다. */
export async function chatWithBanker(
  history: BankerMessage[],
): Promise<BankerReply> {
  const userId = await currentUserId();

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      reply:
        "지금은 AI 은행원이 연결되지 않았어요. (서버에 ANTHROPIC_API_KEY를 설정하면 대화로 계획을 조정할 수 있어요.)",
      actions: [],
    };
  }

  // [현재 계획] 사실 — 숫자는 앱이 계산해 넘긴다.
  const holdings = await prisma.holding.findMany({
    where: { userId },
    select: { amount: true },
  });
  const actualAssets = holdings.reduce((s, h) => s + h.amount, 0);
  const ovRows = await prisma.savingOverride.findMany({
    where: { userId },
    select: { monthKey: true, amount: true },
  });
  const overrides: Record<number, number> = Object.fromEntries(
    ovRows.map((o) => [o.monthKey, o.amount]),
  );
  const now = new Date();
  const curKey = now.getFullYear() * 100 + (now.getMonth() + 1);
  const facts = {
    현재자산: actualAssets,
    최종목표: FINAL_GOAL,
    전체달성률퍼센트:
      FINAL_GOAL > 0 ? Math.round((actualAssets / FINAL_GOAL) * 100) : 0,
    이번달연월: curKey,
    이번달저축목표: monthlySaving(curKey, overrides),
    재정의된달: overrides,
    계획월목록: Object.entries(GROUP_MONTH).map(([label, ym]) => ({
      label,
      연월: ym,
      저축목표: monthlySaving(ym, overrides),
    })),
  };

  const client = new Anthropic();
  const msgs: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const actions: string[] = [];

  try {
    for (let i = 0; i < 6; i++) {
      const resp = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 2048,
        system: `${BANKER_SYSTEM}\n\n[현재 계획]\n${JSON.stringify(facts)}`,
        // 커스텀 도구 + 웹 검색(서버 실행 도구 — 최신 금융/조건 정보 조회).
        tools: [
          ...BANKER_TOOLS,
          { type: "web_search_20250305", name: "web_search", max_uses: 5 },
        ],
        messages: msgs,
      });

      const toolUses = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      if (toolUses.length === 0) {
        // 웹 검색이 길어지면 pause_turn으로 끊긴다 — 그대로 이어서 재요청해 마저 답하게 한다.
        if (resp.stop_reason === "pause_turn") {
          msgs.push({
            role: "assistant",
            content: resp.content as unknown as Anthropic.ContentBlockParam[],
          });
          continue;
        }
        const text = resp.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();
        if (actions.length > 0) {
          revalidatePath("/monthly");
          revalidatePath("/roadmap");
        }
        return { reply: text || "네, 반영했어요!", actions };
      }

      // 도구 실행 후 결과를 되돌려준다.
      msgs.push({
        role: "assistant",
        content: resp.content as unknown as Anthropic.ContentBlockParam[],
      });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const r = await runBankerTool(
          userId,
          tu.name,
          tu.input as Record<string, unknown>,
        );
        if (r.ok) actions.push(r.message);
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: r.message,
          is_error: !r.ok,
        });
      }
      msgs.push({ role: "user", content: results });
    }
    if (actions.length > 0) {
      revalidatePath("/monthly");
      revalidatePath("/roadmap");
    }
    return { reply: "요청하신 내용을 반영했어요!", actions };
  } catch {
    return {
      reply:
        "앗, 잠시 문제가 생겼어요. 잠시 후 다시 시도해 주세요. (그동안 계획은 안전하게 유지돼요.)",
      actions,
    };
  }
}

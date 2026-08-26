import { redirect } from "next/navigation";
import {
  Target,
  Gauge,
  Bell,
  PieChart,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { loadDashboard } from "@/lib/analysis";
import { formatPct, formatWon, formatWonKorean } from "@/lib/format";
import { FEASIBILITY_META, PACE_META, type SignalVariant } from "@/lib/ui-meta";
import { CATEGORY_LABELS_KO, type PreservationCheck } from "@/core/types";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Ring } from "@/components/ui/ring";
import { AiCoachCard } from "./ai-coach";

export const dynamic = "force-dynamic";

/** 신호 색 → 작은 점(dot) 배경 클래스 */
const DOT: Record<SignalVariant, string> = {
  good: "bg-emerald-400",
  info: "bg-sky-400",
  warn: "bg-amber-400",
  bad: "bg-rose-400",
};

export default async function DashboardPage() {
  const data = await loadDashboard();
  if (!data) redirect("/onboarding");

  const { diagnosis, pace, anomalies, investment } = data;
  const feasibility = FEASIBILITY_META[diagnosis.feasibility.grade];

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
      {/* 히어로 — 목표 진척 */}
      <Card className="overflow-hidden border-0 shadow-lg shadow-indigo-500/10">
        <div className="bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 p-5 text-white">
          <div className="flex items-center gap-4">
            <Ring
              value={data.progress}
              colorClass="text-white"
              trackClass="text-white/25"
            >
              <span className="text-xl font-bold">
                {data.progress.toFixed(0)}%
              </span>
            </Ring>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs text-white/80">
                <Target className="h-3.5 w-3.5" /> 목표
              </div>
              <div className="truncate text-lg font-bold">{data.title}</div>
              <div className="text-sm text-white/85">
                {formatWonKorean(data.goal.currentAssets)} /{" "}
                {formatWonKorean(data.goal.targetAmount)}
              </div>
              <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">
                <span
                  className={cn("h-1.5 w-1.5 rounded-full", DOT[feasibility.variant])}
                />
                D-{diagnosis.months}개월 · {feasibility.label}
              </span>
            </div>
          </div>
        </div>

        <CardContent className="space-y-3 pt-4">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-lg bg-indigo-50 p-3 dark:bg-indigo-500/10">
              <div className="text-xs text-indigo-500 dark:text-indigo-400">
                필요 월 저축액
              </div>
              <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300">
                {formatWon(diagnosis.requiredMonthlySaving)}
                <span className="ml-0.5 text-xs font-normal">원</span>
              </div>
            </div>
            <div
              className={cn(
                "rounded-lg p-3",
                diagnosis.monthlyShortfall > 0
                  ? "bg-rose-50 dark:bg-rose-500/10"
                  : "bg-emerald-50 dark:bg-emerald-500/10",
              )}
            >
              <div
                className={cn(
                  "flex items-center gap-1 text-xs",
                  diagnosis.monthlyShortfall > 0
                    ? "text-rose-500 dark:text-rose-400"
                    : "text-emerald-600 dark:text-emerald-400",
                )}
              >
                {diagnosis.monthlyShortfall > 0 ? (
                  <>
                    <TrendingDown className="h-3 w-3" /> 월 부족분
                  </>
                ) : (
                  <>
                    <TrendingUp className="h-3 w-3" /> 월 여유분
                  </>
                )}
              </div>
              <div
                className={cn(
                  "text-lg font-bold",
                  diagnosis.monthlyShortfall > 0
                    ? "text-rose-700 dark:text-rose-300"
                    : "text-emerald-700 dark:text-emerald-300",
                )}
              >
                {formatWon(Math.abs(diagnosis.monthlyShortfall))}
                <span className="ml-0.5 text-xs font-normal">원</span>
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {diagnosis.feasibility.message}
          </p>

          <PreservationLine checks={data.preservation} />

          {data.alternatives && (
            <div className="grid gap-2 sm:grid-cols-3">
              <Alt
                title="기한 연장"
                value={`${data.alternatives.extendDeadline.months}개월`}
              />
              <Alt
                title="목표 축소"
                value={formatWonKorean(
                  data.alternatives.reduceTarget.achievableAmount,
                )}
              />
              <Alt
                title="저축 증액"
                value={`+${formatWon(
                  data.alternatives.increaseSaving.additionalPerMonth,
                )}원`}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI 코칭 */}
      <AiCoachCard />

      {/* 함정 4: 이력 부족 시 분석 대신 안내 */}
      {!data.enoughHistory ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm">
              지금까지 <b>{data.historyMonths}개월</b> 기록됐어요.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              3개월 정도 기록하면 지출 페이스와 이상 탐지 분석이 시작됩니다.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 이번 달 페이스 */}
          {pace && (
            <Card>
              <CardHeader className="pb-3">
                <TitleRow
                  icon={Gauge}
                  chip="bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300"
                  right={
                    <Badge variant={PACE_META[pace.signal].variant}>
                      {PACE_META[pace.signal].label}
                    </Badge>
                  }
                >
                  이번 달 페이스
                </TitleRow>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">예상 월말지출 / 예산</span>
                  <span className="font-medium">
                    {formatWon(pace.projectedTotal)} / {formatWon(pace.budget)}원
                  </span>
                </div>
                <Progress
                  value={(pace.projectedTotal / pace.budget) * 100}
                  indicatorClassName={
                    pace.signal === "tight"
                      ? "bg-amber-500"
                      : pace.signal === "surplus"
                        ? "bg-emerald-500"
                        : "bg-sky-500"
                  }
                />
                <p className="text-sm text-muted-foreground">{pace.message}</p>
              </CardContent>
            </Card>
          )}

          {/* 카테고리 알림 */}
          <Card>
            <CardHeader className="pb-3">
              <TitleRow
                icon={Bell}
                chip="bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
              >
                카테고리 알림
              </TitleRow>
            </CardHeader>
            <CardContent>
              {anomalies.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  평소와 크게 다른 카테고리가 없습니다.
                </p>
              ) : (
                <ul className="space-y-2">
                  {anomalies.map((a) => (
                    <li
                      key={a.category}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>
                        <span className="font-medium">
                          {CATEGORY_LABELS_KO[a.category]}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {formatWon(a.baseline)} → {formatWon(a.current)}원
                        </span>
                      </span>
                      <Badge variant={a.deviationAmount > 0 ? "warn" : "info"}>
                        {a.deviationAmount > 0 ? "+" : ""}
                        {(a.deviationRatio * 100).toFixed(0)}%
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* 투자 여력 */}
          {investment && (
            <Card>
              <CardHeader className="pb-3">
                <TitleRow
                  icon={PieChart}
                  chip="bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300"
                  right={<Badge variant="secondary">{investment.profile.label}</Badge>}
                >
                  투자 여력
                </TitleRow>
              </CardHeader>
              <CardContent className="space-y-3">
                <AllocationBar allocation={investment.profile.allocation} />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Stat
                    label="투자가능액"
                    value={`${formatWon(investment.investableAssets)}원`}
                  />
                  <Stat
                    label="월 투자배정"
                    value={`${formatWon(investment.monthlyInvestment)}원`}
                  />
                </div>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {investment.warnings.map((w, i) => (
                    <li key={i}>· {w}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </main>
  );
}

function TitleRow({
  icon: Icon,
  chip,
  children,
  right,
}: {
  icon: React.ComponentType<{ className?: string }>;
  chip: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={cn("grid h-7 w-7 place-items-center rounded-lg", chip)}>
          <Icon className="h-4 w-4" />
        </span>
        <CardTitle className="text-base">{children}</CardTitle>
      </div>
      {right}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function Alt({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2 text-center">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

const PRESERVATION_VARIANT: Record<PreservationCheck["status"], SignalVariant> = {
  growing: "good",
  breakeven: "info",
  shrinking: "warn",
};

function PreservationLine({ checks }: { checks: PreservationCheck[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {checks.map((c) => (
        <Badge key={c.benchmark} variant={PRESERVATION_VARIANT[c.status]}>
          {c.label} 대비 {c.status === "shrinking" ? "" : "+"}
          {formatPct(c.realReturn)}
        </Badge>
      ))}
    </div>
  );
}

function AllocationBar({
  allocation,
}: {
  allocation: { safe: number; bonds: number; stocks: number };
}) {
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        <div className="bg-sky-400" style={{ width: `${allocation.safe}%` }} />
        <div className="bg-emerald-400" style={{ width: `${allocation.bonds}%` }} />
        <div className="bg-violet-500" style={{ width: `${allocation.stocks}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs">
        <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
          <span className="h-2 w-2 rounded-full bg-sky-400" /> 안전 {allocation.safe}
        </span>
        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400" /> 채권{" "}
          {allocation.bonds}
        </span>
        <span className="flex items-center gap-1 text-violet-600 dark:text-violet-400">
          <span className="h-2 w-2 rounded-full bg-violet-500" /> 주식{" "}
          {allocation.stocks}
        </span>
      </div>
    </div>
  );
}

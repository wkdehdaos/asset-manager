import Link from "next/link";
import { redirect } from "next/navigation";
import { loadDashboard } from "@/lib/analysis";
import { formatPct, formatWon, formatWonKorean } from "@/lib/format";
import { FEASIBILITY_META, PACE_META, type SignalVariant } from "@/lib/ui-meta";
import { CATEGORY_LABELS_KO, type PreservationCheck } from "@/core/types";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AiCoachCard } from "./ai-coach";

export const dynamic = "force-dynamic"; // 항상 최신 DB 상태로 렌더

export default async function DashboardPage() {
  const data = await loadDashboard();
  if (!data) redirect("/onboarding");

  const { diagnosis, pace, anomalies, investment } = data;
  const feasibility = FEASIBILITY_META[diagnosis.feasibility.grade];

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">{data.title}</h1>
        <div className="flex gap-2">
          <Link
            href="/transactions"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            지출 입력
          </Link>
          <Link
            href="/onboarding"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            목표 수정
          </Link>
        </div>
      </header>

      {/* 목표 진척 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>목표 진척</CardTitle>
            <Badge variant={feasibility.variant}>{feasibility.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress
            value={data.progress}
            indicatorClassName={diagnosis.onTrack ? "bg-signal-good" : undefined}
          />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {formatWonKorean(data.goal.currentAssets)} /{" "}
              {formatWonKorean(data.goal.targetAmount)}
            </span>
            <span className="font-medium">
              {data.progress.toFixed(0)}% · D-{diagnosis.months}개월
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-md bg-muted p-3 text-sm">
            <Stat
              label="필요 월 저축액"
              value={`${formatWon(diagnosis.requiredMonthlySaving)}원`}
            />
            <Stat
              label={
                diagnosis.monthlyShortfall > 0 ? "월 부족분" : "월 여유분"
              }
              value={`${formatWon(Math.abs(diagnosis.monthlyShortfall))}원`}
            />
          </div>

          <p className="text-sm">{diagnosis.feasibility.message}</p>

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

      {/* AI 코칭 (온디맨드) */}
      <AiCoachCard />

      {/* 함정 4: 이력 부족 시 분석 대신 안내 */}
      {!data.enoughHistory ? (
        <Card className="mt-4">
          <CardContent className="py-8 text-center">
            <p className="text-sm">
              지금까지 <b>{data.historyMonths}개월</b> 기록됐어요.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              3개월 정도 기록하면 지출 페이스와 이상 탐지 분석이 시작됩니다.
            </p>
            <Link
              href="/transactions"
              className={buttonVariants({ size: "sm" }) + " mt-4"}
            >
              지출 입력하기
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 이번 달 페이스 */}
          {pace && (
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle>이번 달 페이스</CardTitle>
                  <Badge variant={PACE_META[pace.signal].variant}>
                    {PACE_META[pace.signal].label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    예상 월말지출 / 예산
                  </span>
                  <span className="font-medium">
                    {formatWon(pace.projectedTotal)} /{" "}
                    {formatWon(pace.budget)}원
                  </span>
                </div>
                <Progress
                  value={(pace.projectedTotal / pace.budget) * 100}
                  indicatorClassName={
                    pace.signal === "tight"
                      ? "bg-signal-warn"
                      : pace.signal === "surplus"
                        ? "bg-signal-good"
                        : "bg-signal-info"
                  }
                />
                <p className="text-sm">{pace.message}</p>
              </CardContent>
            </Card>
          )}

          {/* 카테고리 이상 알림 */}
          <Card className="mt-4">
            <CardHeader className="pb-3">
              <CardTitle>카테고리 알림</CardTitle>
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
                      <Badge
                        variant={a.deviationAmount > 0 ? "warn" : "info"}
                      >
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
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle>투자 여력</CardTitle>
                  <Badge variant="secondary">
                    {investment.profile.label}
                  </Badge>
                </div>
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
    <div className="rounded-md border p-2 text-center">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

const PRESERVATION_VARIANT: Record<
  PreservationCheck["status"],
  SignalVariant
> = {
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
        <div
          className="bg-signal-info"
          style={{ width: `${allocation.safe}%` }}
        />
        <div
          className="bg-signal-good"
          style={{ width: `${allocation.bonds}%` }}
        />
        <div
          className="bg-signal-warn"
          style={{ width: `${allocation.stocks}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>안전 {allocation.safe}</span>
        <span>채권 {allocation.bonds}</span>
        <span>주식 {allocation.stocks}</span>
      </div>
    </div>
  );
}

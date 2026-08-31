"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import {
  computeRoadmapProgress,
  type RoadmapMilestoneView,
} from "@/core/roadmap";
import { togglePlanItem, type RoadmapTaskGroup } from "@/app/actions";
import {
  PLAN_CATEGORY_META,
  PLAN_CATEGORY_ORDER,
  type PlanCategory,
} from "@/lib/roadmap-data";
import { formatWon, formatWonKorean } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  milestones: RoadmapMilestoneView[];
  taskGroups: RoadmapTaskGroup[];
  finalGoal: number;
  currentAssets: number;
  dDay: number;
  monthEndDDay: number;
}

export function RoadmapClient({
  milestones: initialMs,
  taskGroups: initialGroups,
  finalGoal,
  currentAssets,
  dDay,
  monthEndDDay,
}: Props) {
  const [ms, setMs] = useState(initialMs);
  const [groups, setGroups] = useState(initialGroups);
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(initialGroups.length ? [initialGroups[0]!.group] : []),
  );
  const [selectedCat, setSelectedCat] = useState<PlanCategory | "all">("all");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startTransition] = useTransition();

  const progress = useMemo(
    () => computeRoadmapProgress(ms, finalGoal, currentAssets),
    [ms, finalGoal, currentAssets],
  );

  // 목표금액 오름차순 정렬 + 현재(진행 중) 단계 = 첫 미완료.
  const ascMs = useMemo(
    () => [...ms].sort((a, b) => a.targetAmount - b.targetAmount),
    [ms],
  );
  const currentIdx = ascMs.findIndex((m) => !m.done);
  const current = currentIdx >= 0 ? ascMs[currentIdx] : null;
  const maxTarget = ascMs.length ? ascMs[ascMs.length - 1]!.targetAmount : 0;

  const currentPct =
    current && current.targetAmount > 0
      ? Math.min(100, Math.round((currentAssets / current.targetAmount) * 100))
      : 0;

  function toggleGroup(name: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleMilestone(id: string) {
    let next = false;
    setMs((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        next = !m.done;
        return { ...m, done: next };
      }),
    );
    startTransition(() => void togglePlanItem(id, next));
  }

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  function toggleTask(id: string) {
    let next = false;
    let toastMsg: string | null = null;
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        items: g.items.map((t) => {
          if (t.id !== id) return t;
          next = !t.done;
          if (next && t.amount) {
            const label =
              t.category === "saving"
                ? "저축 완료 💰"
                : t.category === "income"
                  ? "수입 확보 💵"
                  : "완료 ✅";
            toastMsg = `${formatWon(t.amount)}원 ${label}`;
          }
          return { ...t, done: next };
        }),
      })),
    );
    if (toastMsg) showToast(toastMsg);
    startTransition(() => void togglePlanItem(id, next));
  }

  // 서버에서 이미 '도래한 달'만 넘어온다. 이번 달(강조) = 가장 최근, 나머지 = 지난 달.
  const featured = groups.length ? groups[groups.length - 1]! : null;
  const restGroups = groups.slice(0, -1);
  const featuredPct =
    featured && featured.items.length
      ? Math.round(
          (featured.items.filter((t) => t.done).length /
            featured.items.length) *
            100,
        )
      : 0;

  const featuredItems = featured?.items ?? [];
  // 이번 달 누적 저축액 = 체크한 저축 카테고리 할 일의 금액 합.
  const savedTarget = featuredItems
    .filter((t) => t.category === "saving" && t.done)
    .reduce((s, t) => s + (t.amount ?? 0), 0);
  const savedCountUp = useCountUp(savedTarget);
  // 이번 달에 실제로 존재하는 카테고리만 칩으로.
  const catsInMonth = PLAN_CATEGORY_ORDER.filter((c) =>
    featuredItems.some((t) => t.category === c),
  );
  const filteredItems =
    selectedCat === "all"
      ? featuredItems
      : featuredItems.filter((t) => t.category === selectedCat);

  // 월말 마감 동기부여 상태.
  const remaining = featuredItems.filter((t) => !t.done).length;
  const allDone = featuredItems.length > 0 && remaining === 0;
  const monthNum = featured ? featured.monthKey % 100 : 0;
  const urgent = remaining > 0 && monthEndDDay <= 7; // 마감 임박 + 미완료
  const firstUndone = featuredItems.find((t) => !t.done);
  const firstUndoneTitle = firstUndone
    ? firstUndone.title.split(" (")[0]!.trim()
    : "";

  return (
    <div className="space-y-5 pb-4">
      {/* 헤더 */}
      <header className="pt-1 text-center">
        <h1 className="text-xl font-bold">2030년 1억 모으기 🚀</h1>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">
          D-{dDay.toLocaleString("ko-KR")} · 전체 달성률 {progress.percent}%
        </p>
      </header>

      {/* 하이라이트 카드 (현재 단계) */}
      {current ? (
        // 크림색 카드 — 라이트/다크 상관없이 이미지와 동일하게 고정.
        <div
          className="rounded-3xl p-5 shadow-sm"
          style={{ backgroundColor: "#FFF7D3" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-neutral-800">
              현재 단계 ({currentIdx + 1}/{ascMs.length})
            </span>
            <span className="rounded-full bg-[#FFE500] px-3 py-1 text-[11px] font-extrabold text-neutral-900">
              진행 중
            </span>
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <div className="text-3xl font-extrabold leading-tight text-neutral-900">
                {formatWonKorean(current.targetAmount)}
              </div>
              <div className="mt-1.5 text-sm font-medium text-neutral-500">
                현재 {formatWonKorean(currentAssets)}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* 이미지에서 추출한 캐릭터 (배경 #FFF7D3로 카드와 자연스럽게 연결) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/roadmap-character.png"
                alt="저축 캐릭터"
                className="h-[72px] w-auto"
              />
              <span className="text-base font-extrabold text-neutral-800">
                {currentPct}%
              </span>
            </div>
          </div>
          {/* 멀티컬러 진행바 (카테고리 색감) */}
          <div
            className="mt-4 h-3 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: "#EAE3C4" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${currentPct}%`,
                background:
                  "linear-gradient(90deg,#f87171,#fbbf24,#34d399,#38bdf8,#a78bfa)",
              }}
            />
          </div>
        </div>
      ) : (
        <Card className="p-6 text-center">
          <div className="text-3xl">🏆</div>
          <div className="mt-2 text-lg font-bold">모든 목표 달성!</div>
          <div className="text-sm text-muted-foreground">
            1억 로드맵을 완주했어요 🎉
          </div>
        </Card>
      )}

      {/* 달성 로드맵 (점-라인 타임라인) */}
      <section>
        <h2 className="mb-2 text-base font-bold">달성 로드맵</h2>
        <Card className="p-4">
          <ul>
            {ascMs.map((m, i) => {
              const state = m.done
                ? "done"
                : m.id === current?.id
                  ? "current"
                  : "future";
              const isLast = i === ascMs.length - 1;
              return (
                <li key={m.id} className="relative">
                  <button
                    type="button"
                    onClick={() => toggleMilestone(m.id)}
                    className="flex w-full gap-3 text-left"
                  >
                    {/* 세로 연결선 */}
                    {!isLast && (
                      <span className="absolute left-[7px] top-4 h-full w-0.5 bg-border" />
                    )}
                    {/* 점 */}
                    <span className="relative z-10 mt-0.5 shrink-0">
                      {state === "done" ? (
                        <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white">
                          <Check className="h-2.5 w-2.5" />
                        </span>
                      ) : state === "current" ? (
                        <span className="block h-4 w-4 rounded-full bg-blue-500 ring-4 ring-blue-500/20" />
                      ) : (
                        <span className="block h-4 w-4 rounded-full border-2 border-muted-foreground/30 bg-card" />
                      )}
                    </span>
                    {/* 내용 */}
                    <div className={cn("flex-1", isLast ? "pb-0" : "pb-5")}>
                      <div className="text-[11px] text-muted-foreground">
                        {m.label}
                        {state === "current" && " · 현재"}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "font-bold",
                            state === "current" &&
                              "text-blue-600 dark:text-blue-400",
                            state === "future" &&
                              "font-medium text-muted-foreground",
                          )}
                        >
                          {formatWonKorean(m.targetAmount)}
                        </span>
                        {state === "done" && (
                          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            완료
                          </span>
                        )}
                        {state === "current" && (
                          <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                            {currentPct}% 진행 중
                          </span>
                        )}
                        {state === "future" &&
                          m.targetAmount === maxTarget && (
                            <span className="text-xs text-muted-foreground">
                              최종
                            </span>
                          )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      {/* 월별 할 일 */}
      <div className="space-y-3">
        {/* 이번 달 — 강조 카드 (필터 칩 + 저축 카운터 + 월말 D-day) */}
        {featured && (
          <Card
            className={cn(
              "border-2 p-4 transition-colors",
              allDone
                ? "border-emerald-400"
                : urgent
                  ? "border-orange-400" // 마감 임박 + 미완료 → 경고색
                  : remaining > 0
                    ? "border-[#FFE500]" // 진행 중 → 카카오 옐로우
                    : "border-transparent",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {featured.group}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                      urgent
                        ? "bg-orange-500 text-white"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    마감 D-{monthEndDDay}
                  </span>
                </div>
                <h2 className="text-lg font-bold">이번 달 해야 할 일 📝</h2>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[10px] text-muted-foreground">
                  이번 달 저축
                </div>
                <div className="text-lg font-extrabold tabular-nums text-sky-600 dark:text-sky-400">
                  {formatWon(savedCountUp)}
                  <span className="text-xs font-bold">원</span>
                </div>
              </div>
            </div>

            {/* 진행바 */}
            <div className="mb-3 mt-2 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${featuredPct}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground">
                {featuredPct}%
              </span>
            </div>

            {/* 카테고리 필터 칩 (수평 스크롤) */}
            <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
              <FilterChip
                active={selectedCat === "all"}
                onClick={() => setSelectedCat("all")}
                label="전체"
              />
              {catsInMonth.map((c) => (
                <FilterChip
                  key={c}
                  active={selectedCat === c}
                  onClick={() => setSelectedCat(c)}
                  label={`${PLAN_CATEGORY_META[c].emoji} ${PLAN_CATEGORY_META[c].label}`}
                />
              ))}
            </div>

            {/* 월말 마감 동기부여 메시지 */}
            {featuredItems.length > 0 && (
              <div
                className={cn(
                  "mb-3 rounded-lg p-2.5 text-xs font-medium",
                  allDone
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : urgent
                      ? "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {allDone
                  ? `🎉 ${monthNum}월 완벽 달성! 최고예요.`
                  : remaining === 1
                    ? `⏰ ${monthNum}월이 ${monthEndDDay}일 남았어요! '${firstUndoneTitle}' 하나만 더 하면 ${monthNum}월 완벽 달성!`
                    : `⏰ ${monthNum}월이 ${monthEndDDay}일 남았어요! 아직 ${remaining}개 남았어요.`}
              </div>
            )}

            {/* 필터된 할 일 */}
            <div className="space-y-2">
              {filteredItems.map((t) => (
                <TaskCard
                  key={t.id}
                  item={t}
                  onToggle={() => toggleTask(t.id)}
                />
              ))}
              {filteredItems.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  이 분류에 할 일이 없어요.
                </p>
              )}
            </div>
          </Card>
        )}

        {/* 다른 달 계획 (아코디언) */}
        {restGroups.length > 0 && (
          <div>
            <h3 className="mb-2 px-1 text-sm font-semibold text-muted-foreground">
              지난 달 계획
            </h3>
            <div className="space-y-2">
              {restGroups.map((g) => {
                const doneCount = g.items.filter((t) => t.done).length;
                const allDone = doneCount === g.items.length;
                const open = openGroups.has(g.group);
                return (
                  <Card key={g.group} className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.group)}
                      className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{g.group}</span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium",
                            allDone
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {doneCount}/{g.items.length}
                        </span>
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          open && "rotate-180",
                        )}
                      />
                    </button>
                    {open && (
                      <div className="space-y-2 border-t bg-muted/30 p-3">
                        {g.items.map((t) => (
                          <TaskCard
                            key={t.id}
                            item={t}
                            onToggle={() => toggleTask(t.id)}
                          />
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 대표 CTA */}
      <Link
        href="/portfolio"
        className={cn(buttonVariants({ size: "lg" }), "w-full font-bold")}
      >
        오늘의 저축하기
      </Link>

      {/* 체크 시 토스트 */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
          <div className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-bold text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

/** 수평 스크롤 필터 칩. */
function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-card text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

/** 숫자 카운트업 — target이 바뀌면 부드럽게 증감 애니메이션. */
function useCountUp(target: number, duration = 500): number {
  const [val, setVal] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const start = prev.current;
    if (start === target) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - (1 - p) * (1 - p); // ease-out
      setVal(Math.round(start + (target - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

/** 할 일 카드 — 파란 체크박스 + 파스텔 카테고리 태그 (PDF 3p 스타일). */
export function TaskCard({
  item,
  onToggle,
}: {
  item: RoadmapTaskGroup["items"][number];
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-muted-foreground/30"
    >
      {/* 파란 체크박스 (Point Blue) */}
      <span
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition-colors",
          item.done
            ? "border-[#3182F6] bg-[#3182F6] text-white"
            : "border-muted-foreground/30 bg-card",
        )}
      >
        {item.done && <Check className="h-4 w-4" />}
      </span>
      {/* 카테고리 태그 + 할 일 (길어도 줄바꿈) */}
      <span className="min-w-0 flex-1 text-sm leading-snug">
        <span
          className={cn(
            "mr-1.5 inline-block rounded px-1.5 py-0.5 align-middle text-[10px] font-bold",
            PLAN_CATEGORY_META[item.category].className,
          )}
        >
          {PLAN_CATEGORY_META[item.category].label}
        </span>
        <span
          className={cn(
            "align-middle",
            item.done && "text-muted-foreground line-through",
          )}
        >
          {item.title}
        </span>
      </span>
    </button>
  );
}

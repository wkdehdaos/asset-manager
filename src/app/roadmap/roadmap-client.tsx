"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import {
  computeRoadmapProgress,
  type RoadmapMilestoneView,
} from "@/core/roadmap";
import { togglePlanItem, type RoadmapTaskGroup } from "@/app/actions";
import { PLAN_CATEGORY_META, PLAN_CATEGORY_ORDER } from "@/lib/roadmap-data";
import { formatWonKorean } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  milestones: RoadmapMilestoneView[];
  taskGroups: RoadmapTaskGroup[];
  finalGoal: number;
  currentAssets: number;
  dDay: number;
}

export function RoadmapClient({
  milestones: initialMs,
  taskGroups: initialGroups,
  finalGoal,
  currentAssets,
  dDay,
}: Props) {
  const [ms, setMs] = useState(initialMs);
  const [groups, setGroups] = useState(initialGroups);
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(initialGroups.length ? [initialGroups[0]!.group] : []),
  );
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

  function toggleTask(id: string) {
    let next = false;
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        items: g.items.map((t) => {
          if (t.id !== id) return t;
          next = !t.done;
          return { ...t, done: next };
        }),
      })),
    );
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
        {/* 카테고리 범례 */}
        <div className="flex flex-wrap gap-1 px-1">
          {PLAN_CATEGORY_ORDER.map((c) => (
            <span
              key={c}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                PLAN_CATEGORY_META[c].className,
              )}
            >
              {PLAN_CATEGORY_META[c].label}
            </span>
          ))}
        </div>

        {/* 이번 달 — 강조 카드 (PDF 스타일, 항상 펼침) */}
        {featured && (
          <Card className="p-4">
            <div className="text-xs font-medium text-muted-foreground">
              {featured.group}
            </div>
            <h2 className="mb-3 text-lg font-bold">이번 달 해야 할 일 📝</h2>
            <div className="mb-3 flex items-center gap-2">
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
            <div className="space-y-2">
              {featured.items.map((t) => (
                <TaskCard
                  key={t.id}
                  item={t}
                  onToggle={() => toggleTask(t.id)}
                />
              ))}
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
    </div>
  );
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

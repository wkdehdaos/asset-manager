"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { togglePlanItem, type MonthlyPlanView } from "@/app/actions";
import { formatWonKorean } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TaskCard } from "@/app/roadmap/roadmap-client";

const STATUS = {
  done: { label: "달성 완료 ✅", saving: "저축액" },
  current: { label: "현재 진행 중 ⚡", saving: "이번 달 저축 목표" },
  future: { label: "예정", saving: "목표 저축액" },
} as const;

export function MonthlyClient({ view }: { view: MonthlyPlanView }) {
  const router = useRouter();
  const [cells, setCells] = useState(view.cells);
  // 기본 펼침 = 현재 달.
  const [openYm, setOpenYm] = useState<number | null>(
    view.cells.find((c) => c.status === "current")?.ym ?? null,
  );
  const [, startTransition] = useTransition();

  function toggleTask(id: string) {
    let next = false;
    setCells((prev) =>
      prev.map((c) => ({
        ...c,
        tasks: c.tasks.map((t) => {
          if (t.id !== id) return t;
          next = !t.done;
          return { ...t, done: next };
        }),
        taskDone: c.tasks.filter((t) =>
          t.id === id ? !t.done : t.done,
        ).length,
      })),
    );
    startTransition(() => void togglePlanItem(id, next));
  }

  return (
    <div className="space-y-4">
      {/* 헤더 + 연도 탭 */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{view.year}년 로드맵</h1>
        <div className="flex flex-wrap gap-1">
          {view.years.map((y) => (
            <Link
              key={y}
              href={`/monthly?year=${y}`}
              scroll={false}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-semibold transition-colors",
                y === view.year
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {y}
            </Link>
          ))}
        </div>
      </header>

      {/* 12개월 카드 */}
      <div className="space-y-2.5">
        {cells.map((c) => {
          const meta = STATUS[c.status];
          const pct =
            c.taskTotal > 0
              ? Math.round((c.taskDone / c.taskTotal) * 100)
              : 0;
          const open = openYm === c.ym;
          const hasTasks = c.tasks.length > 0;
          const isCurrent = c.status === "current";
          return (
            <div key={c.ym}>
              <button
                type="button"
                onClick={() => hasTasks && setOpenYm(open ? null : c.ym)}
                className={cn(
                  "w-full rounded-2xl border p-4 text-left transition-colors",
                  isCurrent
                    ? "border-2 border-[#FFE500] bg-[#FFFBEB] dark:bg-amber-500/10"
                    : "bg-card hover:border-muted-foreground/30",
                  c.status === "done" && "opacity-90",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div
                      className={cn(
                        "font-bold",
                        c.status === "future" && "text-muted-foreground",
                      )}
                    >
                      {c.month}월{" "}
                      <span className="text-xs font-medium text-muted-foreground">
                        ({meta.label})
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm text-muted-foreground">
                      {meta.saving}:{" "}
                      <span
                        className={cn(
                          "font-semibold",
                          c.status !== "future" && "text-foreground",
                        )}
                      >
                        {formatWonKorean(c.savingTarget)}
                      </span>
                      {c.status === "done" && " 완료"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {c.status === "done" && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        100% 성공
                      </span>
                    )}
                    {c.status === "current" && (
                      <span className="rounded-full bg-[#FFE500] px-2 py-0.5 text-[11px] font-bold text-neutral-900">
                        진행률 {pct}%
                      </span>
                    )}
                    {c.status === "future" && (
                      <span className="text-[11px] font-bold text-muted-foreground">
                        {c.dDay > 0 ? `D-${c.dDay}` : "예정"}
                      </span>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {c.status === "future" ? "목표 누적" : "누적"}{" "}
                      {formatWonKorean(c.cumulative)}
                    </div>
                  </div>
                </div>

                {/* 현재 달: 할 일 요약 + 진행바 */}
                {isCurrent && hasTasks && (
                  <div className="mt-3 rounded-lg bg-white/60 p-2 dark:bg-black/10">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">
                        📋 할 일 {c.taskDone}/{c.taskTotal} 완료
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform",
                          open && "rotate-180",
                        )}
                      />
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[#FFCC00] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* 예정/완료 달이라도 할 일이 있으면 펼침 힌트 */}
                {!isCurrent && hasTasks && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <span>📋 할 일 {c.taskDone}/{c.taskTotal}</span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </div>
                )}
              </button>

              {/* 펼친 할 일 목록 */}
              {open && hasTasks && (
                <div className="mt-2 space-y-2 px-1">
                  {c.tasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      item={t}
                      onToggle={() => toggleTask(t.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

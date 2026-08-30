import { getRoadmap } from "@/app/actions";
import { RoadmapClient } from "./roadmap-client";

export const dynamic = "force-dynamic";

/** 2030년 12월 31일까지 남은 일수 (D-Day). 서버에서 계산해 넘긴다. */
function daysUntilGoal(): number {
  const target = new Date(2030, 11, 31); // 2030.12.31
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(
    0,
    Math.round((target.getTime() - today.getTime()) / 86_400_000),
  );
}

export default async function RoadmapPage() {
  const view = await getRoadmap();
  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <RoadmapClient
        milestones={view.progress.milestones}
        taskGroups={view.taskGroups}
        finalGoal={view.finalGoal}
        currentAssets={view.currentAssets}
        dDay={daysUntilGoal()}
      />
    </main>
  );
}

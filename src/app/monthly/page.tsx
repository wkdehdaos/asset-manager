import { getMonthlyPlan } from "@/app/actions";
import { MonthlyClient } from "./monthly-client";

export const dynamic = "force-dynamic";

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  // 연도 미지정 시 실제 자산 기준 '현재 진행 중'인 달의 연도로 자동 진입.
  const yearParam = sp.year ? Number(sp.year) : undefined;
  const view = await getMonthlyPlan(yearParam);
  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <MonthlyClient view={view} />
    </main>
  );
}

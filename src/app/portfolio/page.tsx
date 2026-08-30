import Link from "next/link";
import { getPortfolio } from "@/app/actions";
import { buttonVariants } from "@/components/ui/button";
import { PortfolioClient } from "./portfolio-client";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const view = await getPortfolio();
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">자산 현황</h1>
          <p className="text-xs text-muted-foreground">
            보유 자산을 넣으면 자산군별 비중으로 보여줘요.
          </p>
        </div>
        <Link
          href="/roadmap"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          로드맵
        </Link>
      </header>

      <PortfolioClient view={view} />
    </main>
  );
}

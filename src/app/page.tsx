import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4">
      <h1 className="text-3xl font-bold">자산관리</h1>
      <p className="mt-2 text-muted-foreground">
        2030년 1억 목표까지의 계획을 월별로 관리하고, 달성할 때마다 진행률을
        확인하세요.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/roadmap" className={buttonVariants()}>
          🎯 1억 로드맵
        </Link>
        <Link
          href="/portfolio"
          className={buttonVariants({ variant: "outline" })}
        >
          💰 자산 현황
        </Link>
      </div>
    </main>
  );
}

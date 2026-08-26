import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4">
      <h1 className="text-3xl font-bold">자산관리</h1>
      <p className="mt-2 text-muted-foreground">
        목표 금액과 기한을 넣으면 매달 얼마를 저축해야 하는지 계산하고, 지출을
        추적해 이번 달 페이스를 알려줍니다.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/onboarding" className={buttonVariants()}>
          목표 세우기
        </Link>
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: "outline" })}
        >
          대시보드
        </Link>
      </div>
    </main>
  );
}

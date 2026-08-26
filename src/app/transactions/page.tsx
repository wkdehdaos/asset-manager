import Link from "next/link";
import { prisma } from "@/lib/db";
import { deleteTransaction } from "@/app/actions";
import { CATEGORY_LABELS_KO, type Category } from "@/core/types";
import { formatWon } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { QuickAddForm } from "./quick-add-form";

export const dynamic = "force-dynamic";

const DEMO_EMAIL = "demo@example.com";

interface TxRow {
  id: string;
  date: Date;
  amount: number;
  category: string;
  isFixed: boolean;
  memo: string | null;
}

interface MonthGroup {
  key: string;
  year: number;
  month: number; // 1~12
  total: number;
  items: TxRow[];
}

/** date desc로 정렬된 거래를 월별 그룹으로 묶는다(입력 순서 유지). */
function groupByMonth(rows: TxRow[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  for (const t of rows) {
    const y = t.date.getFullYear();
    const m = t.date.getMonth() + 1;
    const key = `${y}-${m}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, year: y, month: m, total: 0, items: [] };
      groups.set(key, g);
    }
    g.total += t.amount;
    g.items.push(t);
  }
  return [...groups.values()];
}

export default async function TransactionsPage() {
  const user = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    include: { transactions: { orderBy: { date: "desc" } } },
  });
  const groups = groupByMonth(user?.transactions ?? []);

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">지출 입력</h1>
        <div className="flex gap-2">
          <Link
            href="/transactions/import"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            CSV 가져오기
          </Link>
          <Link
            href="/dashboard"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            대시보드
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>빠른 입력</CardTitle>
        </CardHeader>
        <CardContent>
          <QuickAddForm />
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          아직 입력한 지출이 없습니다. 위에서 추가해 보세요.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">
                  {g.year}년 {g.month}월
                </h2>
                <span className="text-xs text-muted-foreground">
                  합계 {formatWon(g.total)}원
                </span>
              </div>
              <ul className="divide-y rounded-lg border">
                {g.items.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 tabular-nums text-muted-foreground">
                        {t.date.getDate()}
                      </span>
                      <span className="font-medium">
                        {CATEGORY_LABELS_KO[t.category as Category] ??
                          t.category}
                      </span>
                      {t.isFixed && (
                        <Badge variant="secondary" className="text-[10px]">
                          고정
                        </Badge>
                      )}
                      {t.memo && (
                        <span className="text-xs text-muted-foreground">
                          {t.memo}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums font-medium">
                        {formatWon(t.amount)}원
                      </span>
                      <form action={deleteTransaction.bind(null, t.id)}>
                        <button
                          type="submit"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="삭제"
                        >
                          ✕
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

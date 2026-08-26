import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CsvImportForm } from "./csv-import-form";

export default function ImportPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">CSV 가져오기</h1>
        <Link
          href="/transactions"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          목록으로
        </Link>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>카드사 명세서 업로드</CardTitle>
          <CardDescription>
            어느 열이 날짜·금액·가맹점인지 지정하면 카테고리를 자동 추론하고
            중복 거래를 걸러냅니다. 저장 전 카테고리는 수정할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CsvImportForm />
        </CardContent>
      </Card>
    </main>
  );
}

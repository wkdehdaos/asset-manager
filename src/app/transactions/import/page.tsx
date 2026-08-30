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
import { KakaoImportForm } from "./kakao-import-form";

export default function ImportPage() {
  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">거래 가져오기</h1>
        <Link
          href="/roadmap"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          로드맵
        </Link>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>카카오뱅크 거래내역</CardTitle>
          <CardDescription>
            잠긴 원본 파일을 그대로 끌어다 놓고 비번만 입력하면 앱이 해독해요.
            본인이체·저금통은 소비에서 자동 제외하고, 결제·이체는 지출로, 입금은
            수입으로 분류하며 중복도 걸러냅니다. 한번 정한 분류는 기억해 다음부터
            자동 적용돼요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KakaoImportForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>카드사 명세서 (CSV)</CardTitle>
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

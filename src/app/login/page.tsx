import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const error = sp.error === "1";
  const next = sp.next ?? "/roadmap";

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-6">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">
          ₩
        </div>
        <h1 className="text-xl font-bold">자산관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          비밀번호를 입력해 주세요
        </p>
      </div>

      <form action={login} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <Input
          type="password"
          name="password"
          inputMode="numeric"
          autoFocus
          placeholder="비밀번호"
          className="h-12 text-center text-lg"
        />
        {error && (
          <p className="text-center text-sm text-destructive">
            비밀번호가 올바르지 않아요.
          </p>
        )}
        <Button type="submit" size="lg" className="h-12 w-full font-bold">
          들어가기
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        나만 접근할 수 있어요 🔒
      </p>
    </main>
  );
}

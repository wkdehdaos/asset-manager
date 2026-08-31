import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 앱 전체 비밀번호 잠금.
 * 로그인 쿠키(app_auth === AUTH_SECRET)가 없으면 /login으로 보낸다.
 * 로그인 페이지·PWA 리소스·정적 파일은 matcher에서 제외돼 통과한다.
 */
export function middleware(req: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  // AUTH_SECRET 미설정 시(잠금 비활성) 그냥 통과 — 잠금을 켜려면 env를 설정.
  if (!secret) return NextResponse.next();

  const authed = req.cookies.get("app_auth")?.value === secret;
  if (authed) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // 로그인·정적·PWA 리소스를 제외한 모든 경로 보호.
  matcher: [
    "/((?!login|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon-192.png|icon-512.png|apple-icon.png|robots.txt).*)",
  ],
};

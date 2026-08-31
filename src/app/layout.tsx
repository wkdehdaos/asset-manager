import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppNav } from "@/components/app-nav";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "자산관리",
  description: "2030년 1억 모으기 — 로드맵·월별·자산·AI 은행원",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "자산관리" },
};

// 모바일 뷰포트 — 노치/홈 인디케이터(safe-area)까지 채우고 확대 방지.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#FEE500",
};

// 하이드레이션 전에 테마를 적용해 다크/라이트 깜빡임(FOUC)을 막는다.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="font-sans" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <PwaRegister />
        <AppNav />
        {/* 하단 고정 탭바에 가리지 않도록 콘텐츠 아래 여백 */}
        <div className="pb-[calc(4rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </body>
    </html>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flag, CalendarDays, PieChart, Bot, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const LINKS = [
  { href: "/roadmap", label: "로드맵", icon: Flag },
  { href: "/monthly", label: "월별", icon: CalendarDays },
  { href: "/portfolio", label: "자산", icon: PieChart },
  { href: "/assistant", label: "AI", icon: Bot },
  { href: "/transactions/import", label: "가져오기", icon: Upload },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <>
      {/* 상단 슬림 헤더 — 로고 + 테마 */}
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-lg items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-bold">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary text-[11px] font-bold text-primary-foreground">
              ₩
            </span>
            자산관리
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* 하단 탭바 — 모바일 앱 스타일 (화면 아래 고정) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-stretch justify-around">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 border-t-2 py-2 text-[10px] font-medium transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </div>
        {/* 아이폰 홈 인디케이터 safe-area */}
        <div style={{ height: "env(safe-area-inset-bottom)" }} />
      </nav>
    </>
  );
}

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
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
            ₩
          </span>
          자산관리
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/20 font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
          <div className="mx-1 h-5 w-px bg-border" />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

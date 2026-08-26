import * as React from "react";
import { cn } from "@/lib/utils";

export interface RingProps {
  /** 0~100 */
  value: number;
  size?: number;
  stroke?: number;
  /** 채움 색 (text-* 클래스 — stroke는 currentColor) */
  colorClass?: string;
  trackClass?: string;
  children?: React.ReactNode;
  className?: string;
}

/** SVG 원형 진척 링. 차트 라이브러리 없이 직접 그린다. */
export function Ring({
  value,
  size = 92,
  stroke = 9,
  colorClass = "text-primary",
  trackClass = "text-muted",
  children,
  className,
}: RingProps) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - v / 100);
  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          className={trackClass}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
        />
        <circle
          className={cn(colorClass, "transition-all duration-700")}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}

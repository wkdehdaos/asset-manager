"use client";

import { useState } from "react";
import { Camera, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { PhotoAdd } from "./photo-add";

/**
 * 헤더의 '사진' 버튼 — 로드맵 버튼과 나란히. 누르면 모달로 사진 추가 흐름을 연다.
 * 모달은 모바일에서 바텀시트, 넓은 화면에선 가운데 카드.
 */
export function PhotoAddButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}
      >
        <Camera className="h-4 w-4" />
        사진
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-background p-4 shadow-xl sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">사진으로 자산 추가</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="닫기"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <PhotoAdd embedded onDone={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}

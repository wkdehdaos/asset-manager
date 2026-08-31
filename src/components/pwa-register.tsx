"use client";

import { useEffect } from "react";

/** 서비스워커 등록 — PWA 설치 가능 조건을 만족시킨다. */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 등록 실패해도 앱은 정상 동작.
      });
    }
  }, []);
  return null;
}

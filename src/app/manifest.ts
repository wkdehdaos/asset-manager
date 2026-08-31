import type { MetadataRoute } from "next";

/** PWA 매니페스트 — 폰 홈 화면에 '앱'으로 설치되게 한다. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "자산관리 — 2030 1억 모으기",
    short_name: "자산관리",
    description: "1억 로드맵·월별 계획·자산 포트폴리오·AI 은행원",
    start_url: "/roadmap",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F4F5F7",
    theme_color: "#FEE500",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

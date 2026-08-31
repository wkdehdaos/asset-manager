"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** 비밀번호 확인 → 맞으면 인증 쿠키를 심고 목적지로 이동. */
export async function login(formData: FormData): Promise<void> {
  const pw = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/roadmap") || "/roadmap";
  const secret = process.env.AUTH_SECRET;

  if (secret && pw === process.env.APP_PASSWORD) {
    const jar = await cookies();
    jar.set("app_auth", secret, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production", // 로컬 http에서도 동작하게
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30일
    });
    redirect(next.startsWith("/") ? next : "/roadmap");
  }
  redirect("/login?error=1");
}

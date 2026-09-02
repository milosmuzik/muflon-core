"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, podpis } from "@/lib/auth";

function bezpecnaCesta(cesta: string): string {
  return cesta.startsWith("/") && !cesta.startsWith("//") ? cesta : "/";
}

export async function prihlasit(formData: FormData) {
  const heslo = String(formData.get("heslo") || "");
  const dalsi = bezpecnaCesta(String(formData.get("dalsi") || "/"));
  const expected = process.env.AUTH_PASSWORD || "";
  if (!expected || heslo !== expected) redirect("/prihlaseni?chyba=1");

  cookies().set(COOKIE, await podpis(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(dalsi);
}

export async function odhlasit() {
  cookies().delete(COOKIE);
  redirect("/prihlaseni");
}

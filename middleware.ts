import { NextRequest, NextResponse } from "next/server";
import { COOKIE, cookiePlatne } from "@/lib/auth";

const VOLNE = ["/prihlaseni", "/api/public", "/api/cron", "/api/admin", "/api/socialni"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (VOLNE.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();

  const heslo = process.env.AUTH_PASSWORD;
  if (await cookiePlatne(req.cookies.get(COOKIE)?.value, heslo)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/prihlaseni";
  url.search = `?dalsi=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

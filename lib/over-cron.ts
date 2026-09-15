import { NextRequest, NextResponse } from "next/server";

/**
 * Fail-closed: bez CRON_SECRET je cron zakázaný.
 *
 * Přijímá autorizaci dvěma způsoby:
 * 1) hlavička Authorization: Bearer <secret> - takhle posílá Vercel svůj
 *    vlastní cron automaticky.
 * 2) query parametr ?secret=<secret> - jednodušší varianta pro cron-job.org,
 *    ať stačí vyplnit jen URL a nemusí se tam nastavovat vlastní hlavičky.
 */
export function overCron(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET není nastaven" }, { status: 401 });
  }
  const hlavicka = request.headers.get("authorization");
  const zQuery = request.nextUrl.searchParams.get("secret");
  if (hlavicka !== `Bearer ${secret}` && zQuery !== secret) {
    return NextResponse.json({ error: "Neautorizováno" }, { status: 401 });
  }
  return null;
}

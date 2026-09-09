import { NextRequest, NextResponse } from "next/server";

/** Fail-closed: bez CRON_SECRET je cron zakázaný. */
export function overCron(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET není nastaven" }, { status: 401 });
  }
  const hlavicka = request.headers.get("authorization");
  if (hlavicka !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Neautorizováno" }, { status: 401 });
  }
  return null;
}

import { NextRequest, NextResponse } from "next/server";
import { vygenerovatNavrhyKalendare } from "@/lib/agent/navrhy-kalendar";
import { overCron } from "@/lib/over-cron";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const zamitnout = overCron(request);
  if (zamitnout) return zamitnout;

  try {
    const vysledek = await vygenerovatNavrhyKalendare(7);
    return NextResponse.json(vysledek);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

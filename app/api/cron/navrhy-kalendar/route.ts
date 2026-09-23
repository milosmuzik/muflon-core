import { NextRequest, NextResponse } from "next/server";
import { overCron } from "@/lib/over-cron";
import { vygenerovatNavrhyKalendare } from "@/lib/agent/navrhy-kalendar";
import { ROZPOCET_SDRUZENA_KONTROLA_MS } from "@/lib/constants";
import { vytvorRozpocet } from "@/lib/agent/rozpocet-casu";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const zamitnout = overCron(request);
  if (zamitnout) return zamitnout;

  const rozpocet = vytvorRozpocet(ROZPOCET_SDRUZENA_KONTROLA_MS);
  try {
    const kalendar = await vygenerovatNavrhyKalendare(7, rozpocet);
    return NextResponse.json({ kalendar });
  } catch (e) {
    return NextResponse.json({ chyby: [(e as Error).message] }, { status: 200 });
  } finally {
    rozpocet.uklidit();
  }
}

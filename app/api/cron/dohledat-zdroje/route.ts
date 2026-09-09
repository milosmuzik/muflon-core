import { NextRequest, NextResponse } from "next/server";
import { dohledatChybejiciZdroje } from "@/lib/agent/dohledat-zdroje-hromadne";
import { overCron } from "@/lib/over-cron";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const zamitnout = overCron(request);
  if (zamitnout) return zamitnout;

  try {
    const vysledek = await dohledatChybejiciZdroje(8);
    return NextResponse.json(vysledek);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

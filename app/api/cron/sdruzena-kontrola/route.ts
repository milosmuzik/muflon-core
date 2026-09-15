import { NextRequest, NextResponse } from "next/server";
import { overCron } from "@/lib/over-cron";
import { spustitSdruzeneKontrolu } from "@/lib/actions/kontrola";
import { vygenerovatNavrhyKalendare } from "@/lib/agent/navrhy-kalendar";

// POZOR: 300 s vyžaduje Vercel Pro (nebo Fluid Compute). Na Hobby plánu
// snižte na max. 60 a odpovídajícím způsobem zmenšete dávky v kontrola.ts,
// jinak funkce doběhne na timeout dřív, než se stihne dokončit.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const zamitnout = overCron(request);
  if (zamitnout) return zamitnout;

  const kontrola = await spustitSdruzeneKontrolu();

  let kalendar: Awaited<ReturnType<typeof vygenerovatNavrhyKalendare>> | null = null;
  try {
    kalendar = await vygenerovatNavrhyKalendare(1);
  } catch (e) {
    kontrola.chyby.push(`Kalendář: ${(e as Error).message}`);
  }

  return NextResponse.json({ kontrola, kalendar });
}

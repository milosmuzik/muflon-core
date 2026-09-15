import { NextRequest, NextResponse } from "next/server";
import { overCron } from "@/lib/over-cron";
import { spustitSdruzeneKontrolu } from "@/lib/actions/kontrola";
import { vygenerovatNavrhyKalendare } from "@/lib/agent/navrhy-kalendar";

// Hobby plán: max 60 s (300 by vůbec neproběhlo). Dávky v kontrola.ts jsou
// odpovídajícím způsobem zmenšené (viz komentáře u dohledatChybejiciZdroje
// a doplnitKatalogDavku), ať tohle bezpečně doběhne v 60 s.
export const maxDuration = 60;

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

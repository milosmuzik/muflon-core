import { NextRequest, NextResponse } from "next/server";
import { overCron } from "@/lib/over-cron";
import { spustitSdruzeneKontrolu } from "@/lib/actions/kontrola";
import { vygenerovatNavrhyKalendare } from "@/lib/agent/navrhy-kalendar";
import { ROZPOCET_SDRUZENA_KONTROLA_MS } from "@/lib/constants";
import { vytvorRozpocet } from "@/lib/agent/rozpocet-casu";

// Hobby plán: max 60 s (300 by vůbec neproběhlo). Skutečná ochrana teď stojí
// na JEDNOM sdíleném časovém rozpočtu (ROZPOCET_SDRUZENA_KONTROLA_MS, viz
// lib/constants.ts), který se předává do spustitSdruzeneKontroly() A dál do
// vygenerovatNavrhyKalendare() níž – dřív to byly dvě na sobě nezávislé,
// obě zcela neomezené fáze, což byl hlavní zdroj opakovaných 504
// FUNCTION_INVOCATION_TIMEOUT (viz lib/agent/rozpocet-casu.ts).
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const zamitnout = overCron(request);
  if (zamitnout) return zamitnout;

  const rozpocet = vytvorRozpocet(ROZPOCET_SDRUZENA_KONTROLA_MS);
  try {
    const kontrola = await spustitSdruzeneKontrolu(rozpocet);

    let kalendar: Awaited<ReturnType<typeof vygenerovatNavrhyKalendare>> | null = null;
    if (!rozpocet.vyprsel()) {
      try {
        kalendar = await vygenerovatNavrhyKalendare(1, rozpocet);
      } catch (e) {
        kontrola.chyby.push(`Kalendář: ${(e as Error).message}`);
      }
    } else {
      kontrola.chyby.push("Časový rozpočet vyčerpán před krokem 'Mufloní kalendář' – přeskočeno, doběhne příště.");
    }

    return NextResponse.json({ kontrola, kalendar });
  } finally {
    rozpocet.uklidit();
  }
}

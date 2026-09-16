import { NextRequest, NextResponse } from "next/server";
import { overCron } from "@/lib/over-cron";
import { spustitAutomatickeDoplnovani } from "@/lib/actions/auto-doplnovani";
import { ROZPOCET_AUTO_DOPLNOVANI_MS } from "@/lib/constants";
import { vytvorRozpocet } from "@/lib/agent/rozpocet-casu";

// Hobby plán: max 60 s. Skutečná ochrana proti přesažení už ale NENÍ tenhle
// export sám o sobě – je to sdílený časový rozpočet ROZPOCET_AUTO_DOPLNOVANI_MS
// (aktuálně výrazně nižší než 60s, viz lib/constants.ts), provázaný přes
// AbortSignal se všemi síťovými voláními uvnitř (lib/agent/rozpocet-casu.ts).
// Tenhle export je jen krajní pojistka pro Vercel, kdyby si funkce přesto
// vzala víc, než by měla.
export const maxDuration = 60;

// Voláno externě z cron-job.org (Vercel Hobby cron neumí častěji než 1x/den)
// – stejná autorizace jako u /api/cron/sdruzena-kontrola: hlavička
// Authorization: Bearer <CRON_SECRET>.
export async function GET(request: NextRequest) {
  const zamitnout = overCron(request);
  if (zamitnout) return zamitnout;

  const rozpocet = vytvorRozpocet(ROZPOCET_AUTO_DOPLNOVANI_MS);
  try {
    const vysledek = await spustitAutomatickeDoplnovani(rozpocet);
    return NextResponse.json(vysledek);
  } finally {
    rozpocet.uklidit();
  }
}

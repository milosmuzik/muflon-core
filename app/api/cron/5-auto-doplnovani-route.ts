import { NextRequest, NextResponse } from "next/server";
import { overCron } from "@/lib/over-cron";
import { spustitAutomatickeDoplnovani } from "@/lib/actions/auto-doplnovani";

// Hobby plán: max 60 s. Vnitřní smyčka (auto-doplnovani.ts) se sama
// zastavuje po ~30 s – tohle je jen tvrdý strop pro jistotu, ať Vercel
// funkci nezabije uprostřed rozjetého Gemini/MusicBrainz volání.
export const maxDuration = 60;

// Voláno externě z cron-job.org (Vercel Hobby cron neumí častěji než 1x/den)
// – stejná autorizace jako u /api/cron/sdruzena-kontrola: hlavička
// Authorization: Bearer <CRON_SECRET>.
export async function GET(request: NextRequest) {
  const zamitnout = overCron(request);
  if (zamitnout) return zamitnout;

  const vysledek = await spustitAutomatickeDoplnovani();
  return NextResponse.json(vysledek);
}

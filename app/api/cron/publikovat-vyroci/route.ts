import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publikovatUdalost } from "@/lib/actions/socialni";
import { overCron } from "@/lib/over-cron";
import { isoPraha, mmddPraha, zacatekRokuUtc } from "@/lib/cas";
import { AUTOSCHVALENI_OD_UROVNE, urovenDuveryPriorita, urovenDuveryZeZdroje } from "@/lib/constants";

// Hobby plán: max 60 s. Jedno volání Graph API má strop 10 s
// (SOCIALNI_TIMEOUT_MS), celý běh se navíc zastaví po CASOVY_LIMIT_MS.
export const maxDuration = 60;

const CASOVY_LIMIT_MS = 40_000;
const VEREJNE_STAVY = ["schvaleno", "publikovano"];
/** Kolikrát za běh zkusit publikovat na jednu platformu (při chybě se zkusí další kandidát). */
const MAX_POKUSU_NA_PLATFORMU = 2;
const PLATFORMY = ["facebook", "instagram"] as const;
type Platforma = (typeof PLATFORMY)[number];

async function jizLetosPublikovano(udalostId: string, platforma: string, letosniZacatek: Date) {
  const zaznam = await prisma.publikace.findFirst({
    where: { udalostId, platforma, stav: "publikovano", publikovanoV: { gte: letosniZacatek } },
  });
  return !!zaznam;
}

/**
 * Poslední pojistka před zveřejněním: událost musí i v okamžiku publikace
 * projít whitelistem (stejné pravidlo jako automatické schválení, spočítané
 * znovu z aktuálních zdrojů). Chrání před událostmi, které se dostaly do
 * stavu "schvaleno" podle starších, volnějších pravidel. Událost bez
 * jakéhokoliv zdroje projde jen tehdy, když ji nezaložil AI agent.
 */
async function projdeWhitelistem(udalost: { id: string; zdrojAI: boolean }): Promise<boolean> {
  const zdroje = await prisma.zdroj.findMany({
    where: { cilovyTyp: "Udalost", cilovyId: udalost.id },
    select: { kategorie: true, url: true },
  });
  if (zdroje.length === 0) return !udalost.zdrojAI;
  return zdroje.some(
    (z: { kategorie: string; url: string | null }) => urovenDuveryPriorita(urovenDuveryZeZdroje(z.kategorie, z.url)) >= AUTOSCHVALENI_OD_UROVNE
  );
}

export async function GET(request: NextRequest) {
  const zamitnout = overCron(request);
  if (zamitnout) return zamitnout;

  const start = Date.now();
  const mmdd = mmddPraha();
  const iso = isoPraha();
  const letosniZacatek = zacatekRokuUtc();

  const kandidati = await prisma.udalost.findMany({
    where: { datum: { in: [mmdd, iso] }, stav: { in: VEREJNE_STAVY } },
    orderBy: { createdAt: "asc" },
  });

  const publikovano: Record<Platforma, string | null> = { facebook: null, instagram: null };
  const pokusy: Record<Platforma, number> = { facebook: 0, instagram: 0 };
  const neproslyWhitelistem: string[] = [];
  const chyby: string[] = [];

  for (const udalost of kandidati) {
    if (Date.now() - start > CASOVY_LIMIT_MS) {
      chyby.push("Časový limit běhu vyčerpán, zbytek kandidátů přeskočen.");
      break;
    }
    if (PLATFORMY.every((p) => publikovano[p] || pokusy[p] >= MAX_POKUSU_NA_PLATFORMU)) break;

    if (!(await projdeWhitelistem(udalost))) {
      neproslyWhitelistem.push(udalost.nazev);
      continue;
    }

    for (const platforma of PLATFORMY) {
      if (publikovano[platforma] || pokusy[platforma] >= MAX_POKUSU_NA_PLATFORMU) continue;
      if (await jizLetosPublikovano(udalost.id, platforma, letosniZacatek)) continue;
      if (Date.now() - start > CASOVY_LIMIT_MS) break;

      if (!udalost.zverejnitNaSitich) {
        await prisma.udalost.update({ where: { id: udalost.id }, data: { zverejnitNaSitich: true } });
        udalost.zverejnitNaSitich = true;
      }
      pokusy[platforma]++;
      try {
        if (await publikovatUdalost(udalost.id, platforma)) {
          publikovano[platforma] = udalost.nazev;
        } else {
          chyby.push(`${platforma}: publikace „${udalost.nazev}“ selhala (detail v Publikacích).`);
        }
      } catch (e) {
        chyby.push(`${platforma}: ${(e as Error).message}`);
      }
    }
  }

  return NextResponse.json({
    kandidatu: kandidati.length,
    publikovanoFacebook: publikovano.facebook,
    publikovanoInstagram: publikovano.instagram,
    neproslyWhitelistem,
    chyby,
  });
}

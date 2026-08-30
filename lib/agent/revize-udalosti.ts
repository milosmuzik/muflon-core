import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import {
  AUTOSCHVALENI_OD_UROVNE,
  POZNAMKA_AI_NAVRH_KALENDAR,
  POZNAMKA_AI_ROZSIRENI,
  POZNAMKA_DOHLEDANO,
  urovenDuveryPriorita,
  urovenDuveryZeZdroje,
} from "@/lib/constants";
import { rozbalRedirect } from "./redirect";

export type VysledekRevize = {
  opravenoZdroju: number;
  zkontrolovanoUdalosti: number;
  schvalenoNove: number;
};

// Projde VŠECHNY existující události (ne jen nově navržené) a:
// 1) u zdrojů založených AI agentem přepočítá důvěru podle kategorie a URL
//    (dřív se všem napevno dosazovala "střední" bez ohledu na kvalitu zdroje),
// 2) události ve stavu návrh/ověřeno, které mají aspoň jeden zdroj s
//    dostatečnou důvěrou, rovnou schválí.
// Ruční zdroje přidané člověkem přes ZdrojeSekce se nepřepisují – jejich
// úroveň důvěry je editorské rozhodnutí, ne odhad.
export async function revidovatUdalosti(): Promise<VysledekRevize> {
  const aiZdroje = await prisma.zdroj.findMany({
    where: {
      cilovyTyp: "Udalost",
      poznamka: { in: [POZNAMKA_AI_NAVRH_KALENDAR, POZNAMKA_AI_ROZSIRENI, POZNAMKA_DOHLEDANO] },
    },
  });

  let opravenoZdroju = 0;
  for (const zdroj of aiZdroje) {
    // Zdroje z Gemini google_search mají URL uloženou jako Google redirect
    // (vertexaisearch.cloud.google.com) - bez rozbalení by whitelist domén
    // nikdy nenašel shodu, i kdyby zdroj citoval renomované médium.
    const skutecnaUrl = zdroj.url ? await rozbalRedirect(zdroj.url) : zdroj.url;
    const spravnaUroven = urovenDuveryZeZdroje(zdroj.kategorie, skutecnaUrl);
    if (spravnaUroven !== zdroj.uroverDuvery || skutecnaUrl !== zdroj.url) {
      await prisma.zdroj.update({
        where: { id: zdroj.id },
        data: { uroverDuvery: spravnaUroven, url: skutecnaUrl },
      });
      opravenoZdroju++;
    }
  }

  const cekajici = await prisma.udalost.findMany({ where: { stav: { in: ["navrh", "overeno"] } } });

  let schvalenoNove = 0;
  for (const udalost of cekajici) {
    const zdroje = await prisma.zdroj.findMany({ where: { cilovyTyp: "Udalost", cilovyId: udalost.id } });
    const nejvyssiUroven = zdroje.reduce((max, z) => Math.max(max, urovenDuveryPriorita(z.uroverDuvery)), 0);
    if (nejvyssiUroven >= AUTOSCHVALENI_OD_UROVNE) {
      await prisma.udalost.update({ where: { id: udalost.id }, data: { stav: "schvaleno" } });
      await zapisHistorii(
        "Udalost",
        udalost.id,
        "zmena_stavu",
        "Automaticky schváleno při hromadné revizi – zdroj s dostatečnou důvěrou"
      );
      schvalenoNove++;
    }
  }

  return { opravenoZdroju, zkontrolovanoUdalosti: cekajici.length, schvalenoNove };
}

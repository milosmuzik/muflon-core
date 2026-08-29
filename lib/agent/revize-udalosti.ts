import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import {
  AUTOSCHVALENI_OD_UROVNE,
  POZNAMKA_AI_NAVRH_KALENDAR,
  POZNAMKA_AI_ROZSIRENI,
  urovenDuveryPriorita,
  urovenDuveryZKategorie,
} from "@/lib/constants";

export type VysledekRevize = {
  opravenoZdroju: number;
  zkontrolovanoUdalosti: number;
  schvalenoNove: number;
};

// Projde VŠECHNY existující události (ne jen nově navržené) a:
// 1) u zdrojů založených AI agentem přepočítá důvěru podle kategorie
//    (dřív se všem napevno dosazovala "střední" bez ohledu na kvalitu zdroje),
// 2) události ve stavu návrh/ověřeno, které mají aspoň jeden zdroj se
//    střední nebo vyšší důvěrou, rovnou schválí.
// Ruční zdroje přidané člověkem přes ZdrojeSekce se nepřepisují – jejich
// úroveň důvěry je editorské rozhodnutí, ne odhad.
export async function revidovatUdalosti(): Promise<VysledekRevize> {
  const aiZdroje = await prisma.zdroj.findMany({
    where: {
      cilovyTyp: "Udalost",
      poznamka: { in: [POZNAMKA_AI_NAVRH_KALENDAR, POZNAMKA_AI_ROZSIRENI] },
    },
  });

  let opravenoZdroju = 0;
  for (const zdroj of aiZdroje) {
    const spravnaUroven = urovenDuveryZKategorie(zdroj.kategorie);
    if (spravnaUroven !== zdroj.uroverDuvery) {
      await prisma.zdroj.update({ where: { id: zdroj.id }, data: { uroverDuvery: spravnaUroven } });
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
        "Automaticky schváleno při hromadné revizi – zdroj se střední nebo vyšší důvěrou"
      );
      schvalenoNove++;
    }
  }

  return { opravenoZdroju, zkontrolovanoUdalosti: cekajici.length, schvalenoNove };
}

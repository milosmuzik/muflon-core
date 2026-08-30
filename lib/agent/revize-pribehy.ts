import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { AUTOSCHVALENI_OD_UROVNE, POZNAMKA_DOHLEDANO, urovenDuveryPriorita, urovenDuveryZeZdroje } from "@/lib/constants";
import { rozbalRedirect } from "./redirect";

export type VysledekReviziPribehu = {
  opravenoZdroju: number;
  zkontrolovanoPribehu: number;
  schvalenoNove: number;
};

// Projde všechny čekající příběhy (návrh/ověřeno) a:
// 1) u zdrojů dohledaných AI fact-checkerem přepočítá důvěru podle
//    kategorie a (rozbalené) URL - stejný důvod jako u revize událostí,
//    Gemini google_search vrací Google redirect místo skutečné adresy.
// 2) ty, které mají aspoň jeden zdroj s dostatečnou důvěrou, rovnou schválí.
// Ruční zdroje přidané člověkem přes ZdrojeSekce se nepřepisují – jejich
// úroveň důvěry je editorské rozhodnutí, ne odhad.
export async function revidovatPribehy(): Promise<VysledekReviziPribehu> {
  const aiZdroje = await prisma.zdroj.findMany({
    where: { cilovyTyp: "Pribeh", poznamka: POZNAMKA_DOHLEDANO },
  });

  let opravenoZdroju = 0;
  for (const zdroj of aiZdroje) {
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

  const cekajici = await prisma.pribeh.findMany({ where: { stav: { in: ["navrh", "overeno"] } } });

  let schvalenoNove = 0;
  for (const pribeh of cekajici) {
    const zdroje = await prisma.zdroj.findMany({ where: { cilovyTyp: "Pribeh", cilovyId: pribeh.id } });
    const nejvyssiUroven = zdroje.reduce((max, z) => Math.max(max, urovenDuveryPriorita(z.uroverDuvery)), 0);
    if (nejvyssiUroven >= AUTOSCHVALENI_OD_UROVNE) {
      await prisma.pribeh.update({ where: { id: pribeh.id }, data: { stav: "schvaleno" } });
      await zapisHistorii(
        "Pribeh",
        pribeh.id,
        "zmena_stavu",
        "Automaticky schváleno při hromadné revizi – zdroj s dostatečnou důvěrou"
      );
      schvalenoNove++;
    }
  }

  return { opravenoZdroju, zkontrolovanoPribehu: cekajici.length, schvalenoNove };
}

import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { AUTOSCHVALENI_OD_UROVNE, urovenDuveryPriorita } from "@/lib/constants";

export type VysledekReviziPribehu = {
  zkontrolovanoPribehu: number;
  schvalenoNove: number;
};

// Projde všechny čekající příběhy (návrh/ověřeno) a ty, které mají aspoň
// jeden zdroj s dostatečnou důvěrou (oficiální kanál nebo renomované médium), rovnou schválí. Na rozdíl od
// revize událostí tu nejsou žádné AI-generované zdroje k přepočítání –
// příběhy zatím vznikají jen ručně, se zdroji zadanými přímo editorem.
export async function revidovatPribehy(): Promise<VysledekReviziPribehu> {
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

  return { zkontrolovanoPribehu: cekajici.length, schvalenoNove };
}

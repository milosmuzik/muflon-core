import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { urovenDuveryZeZdroje } from "@/lib/constants";
import { zvazAutomatickeSchvaleni } from "@/lib/actions/spolecne";
import { dohledatZdroj } from "@/lib/agent/dohledat-zdroj";

const POZNAMKA_DOHLEDANO = "Dohledáno AI fact-checkerem – oficiální kanál nebo renomované médium.";

export type VysledekDohledani = {
  zkontrolovano: number;
  nalezeno: number;
  chyby: string[];
};

// Zpracuje jednu dávku záznamů bez zdroje (příběhy i události ve stavu
// "navrh") a zkusí k nim přes web search dohledat oficiální/renomovaný
// zdroj (viz lib/agent/dohledat-zdroj.ts). Dávka je omezená kvůli limitu
// serverless funkce (Gemini + web search na položku trvá řádově sekundy) –
// tlačítko lze klikat opakovaně, dokud fronta neubude. Záznamy, u kterých
// se zdroj nenajde, se "updatedAt" bump přesune na konec fronty, aby
// opakované kliknutí systematicky procházelo celý zbytek, ne pořád stejné
// první položky.
export async function dohledatChybejiciZdroje(limitNaDavku = 5): Promise<VysledekDohledani> {
  let zkontrolovano = 0;
  let nalezeno = 0;
  const chyby: string[] = [];

  const pribehyNavrh = await prisma.pribeh.findMany({ where: { stav: "navrh" }, orderBy: { updatedAt: "asc" } });
  const pribehyZdroje = await prisma.zdroj.findMany({ where: { cilovyTyp: "Pribeh" }, select: { cilovyId: true } });
  const pribehMaZdroj = new Set(pribehyZdroje.map((z) => z.cilovyId));
  const pribehyKZpracovani = pribehyNavrh.filter((p) => !pribehMaZdroj.has(p.id)).slice(0, limitNaDavku);

  for (const pribeh of pribehyKZpracovani) {
    zkontrolovano++;
    try {
      const nalez = await dohledatZdroj(pribeh.nadpis, pribeh.obsah);
      if (nalez) {
        const uroverDuvery = urovenDuveryZeZdroje(nalez.kategorie, nalez.url);
        await prisma.zdroj.create({
          data: {
            cilovyTyp: "Pribeh", cilovyId: pribeh.id, nazev: nalez.nazev, url: nalez.url,
            kategorie: nalez.kategorie, uroverDuvery, poznamka: POZNAMKA_DOHLEDANO,
          },
        });
        await zapisHistorii("Pribeh", pribeh.id, "upraveno", `AI dohledala zdroj: ${nalez.nazev}`);
        await zvazAutomatickeSchvaleni("Pribeh", pribeh.id, uroverDuvery);
        nalezeno++;
      } else {
        // posune se na konec fronty, aby příští klik zkusil jiné položky
        await prisma.pribeh.update({ where: { id: pribeh.id }, data: { nadpis: pribeh.nadpis } });
      }
    } catch (e) {
      chyby.push(`Příběh „${pribeh.nadpis}“: ${(e as Error).message}`);
    }
  }

  const udalostiNavrh = await prisma.udalost.findMany({ where: { stav: "navrh" }, orderBy: { updatedAt: "asc" } });
  const udalostiZdroje = await prisma.zdroj.findMany({ where: { cilovyTyp: "Udalost" }, select: { cilovyId: true } });
  const udalostMaZdroj = new Set(udalostiZdroje.map((z) => z.cilovyId));
  const udalostiKZpracovani = udalostiNavrh.filter((u) => !udalostMaZdroj.has(u.id)).slice(0, limitNaDavku);

  for (const udalost of udalostiKZpracovani) {
    zkontrolovano++;
    try {
      const nalez = await dohledatZdroj(udalost.nazev, udalost.popis ?? "");
      if (nalez) {
        const uroverDuvery = urovenDuveryZeZdroje(nalez.kategorie, nalez.url);
        await prisma.zdroj.create({
          data: {
            cilovyTyp: "Udalost", cilovyId: udalost.id, nazev: nalez.nazev, url: nalez.url,
            kategorie: nalez.kategorie, uroverDuvery, poznamka: POZNAMKA_DOHLEDANO,
          },
        });
        await zapisHistorii("Udalost", udalost.id, "upraveno", `AI dohledala zdroj: ${nalez.nazev}`);
        await zvazAutomatickeSchvaleni("Udalost", udalost.id, uroverDuvery);
        nalezeno++;
      } else {
        await prisma.udalost.update({ where: { id: udalost.id }, data: { nazev: udalost.nazev } });
      }
    } catch (e) {
      chyby.push(`Událost „${udalost.nazev}“: ${(e as Error).message}`);
    }
  }

  return { zkontrolovano, nalezeno, chyby };
}

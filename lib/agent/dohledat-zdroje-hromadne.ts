import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { urovenDuveryZeZdroje, nazevZeZdroje, POZNAMKA_DOHLEDANO } from "@/lib/constants";
import { zvazAutomatickeSchvaleni } from "@/lib/actions/spolecne";
import { dohledatZdroj } from "@/lib/agent/dohledat-zdroj";
import { smazatStavovouEntitu } from "@/lib/agent/uklid";

export type VysledekDohledani = {
  zkontrolovano: number;
  nalezeno: number;
  smazano: number;
  chyby: string[];
};

export async function dohledatChybejiciZdroje(limitNaDavku = 5): Promise<VysledekDohledani> {
  let zkontrolovano = 0;
  let nalezeno = 0;
  let smazano = 0;
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
            cilovyTyp: "Pribeh",
            cilovyId: pribeh.id,
            nazev: nazevZeZdroje(nalez.url, nalez.nazev),
            url: nalez.url,
            kategorie: nalez.kategorie,
            uroverDuvery,
            poznamka: POZNAMKA_DOHLEDANO,
          },
        });
        await zapisHistorii("Pribeh", pribeh.id, "upraveno", `AI dohledala zdroj: ${nalez.nazev}`);
        await zvazAutomatickeSchvaleni("Pribeh", pribeh.id, uroverDuvery);
        nalezeno++;
      } else if (await smazatStavovouEntitu("Pribeh", pribeh.id)) {
        smazano++;
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
            cilovyTyp: "Udalost",
            cilovyId: udalost.id,
            nazev: nazevZeZdroje(nalez.url, nalez.nazev),
            url: nalez.url,
            kategorie: nalez.kategorie,
            uroverDuvery,
            poznamka: POZNAMKA_DOHLEDANO,
          },
        });
        await zapisHistorii("Udalost", udalost.id, "upraveno", `AI dohledala zdroj: ${nalez.nazev}`);
        await zvazAutomatickeSchvaleni("Udalost", udalost.id, uroverDuvery);
        nalezeno++;
      } else if (await smazatStavovouEntitu("Udalost", udalost.id)) {
        smazano++;
      }
    } catch (e) {
      chyby.push(`Událost „${udalost.nazev}“: ${(e as Error).message}`);
    }
  }

  return { zkontrolovano, nalezeno, smazano, chyby };
}

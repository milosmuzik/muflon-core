import { prisma } from "@/lib/prisma";
import {
  POZNAMKA_AI_NAVRH_KALENDAR,
  POZNAMKA_AI_ROZSIRENI,
  POZNAMKA_DOHLEDANO,
  PRIPONA_ZDROJ_REVIDOVAN,
  nazevZeZdroje,
  urovenDuveryZeZdroje,
} from "@/lib/constants";
import { zvazAutomatickeSchvaleni } from "@/lib/actions/spolecne";
import { rozbalRedirect } from "./redirect";

const AI_POZNAMKY = [POZNAMKA_AI_NAVRH_KALENDAR, POZNAMKA_AI_ROZSIRENI, POZNAMKA_DOHLEDANO];

export type VysledekRevizeVse = {
  zkontrolovano: number;
  opravenoZdroju: number;
  schvalenoNove: number;
  posledniId: string | null;
  hotovo: boolean;
};

// Jediné, centrální místo, které dávkově projde VŠECHNY zdroje založené AI
// agenty (denní kalendář, "Zjisti více", fact-checker) u příběhů i událostí
// najednou a opraví je: rozbalí Google grounding redirect na skutečnou URL,
// opraví zobrazovaný název podle skutečné domény (ne podle toho, co si AI
// vymyslela) a přepočítá důvěru. Kde díky opravě zdroj teď stačí na
// automatické schválení, rovnou to udělá (přes zvazAutomatickeSchvaleni –
// stejná funkce, kterou používá i vznik nového zdroje, žádná duplicitní
// logika). Postupuje podle ID zdroje jako kurzoru, takže opakované klikání
// spolehlivě prochází celou frontu bez ohledu na to, kolik záznamů má.
export async function revidovatVse(kurzor: string | null, limitNaDavku = 25): Promise<VysledekRevizeVse> {
  const davka = await prisma.zdroj.findMany({
    where: {
      cilovyTyp: { in: ["Udalost", "Pribeh"] },
      poznamka: { in: AI_POZNAMKY },
      ...(kurzor ? { id: { gt: kurzor } } : {}),
    },
    orderBy: { id: "asc" },
    take: limitNaDavku,
  });

  let opravenoZdroju = 0;
  let schvalenoNove = 0;

  for (const zdroj of davka) {
    const skutecnaUrl = zdroj.url ? await rozbalRedirect(zdroj.url) : zdroj.url;
    const spravnyNazev = nazevZeZdroje(skutecnaUrl, zdroj.nazev);
    const spravnaUroven = urovenDuveryZeZdroje(zdroj.kategorie, skutecnaUrl);
    const zmeneno = spravnaUroven !== zdroj.uroverDuvery || skutecnaUrl !== zdroj.url || spravnyNazev !== zdroj.nazev;

    if (zmeneno) {
      opravenoZdroju++;
    }

    // Poznámku označíme jako revidovanou vždy, bez ohledu na výsledek - je
    // to deterministický výpočet ze stejné URL/kategorie, opakovaná revize
    // by dopadla stejně. Bez téhle přípony by fronta natrvalo obsahovala i
    // zdroje, co revizí už jednou prošly a zůstaly nedostatečné, a každé
    // další otevření /kontrola by je muselo znovu proklikat.
    await prisma.zdroj.update({
      where: { id: zdroj.id },
      data: { url: skutecnaUrl, nazev: spravnyNazev, uroverDuvery: spravnaUroven, poznamka: `${zdroj.poznamka}${PRIPONA_ZDROJ_REVIDOVAN}` },
    });

    if (await zvazAutomatickeSchvaleni(zdroj.cilovyTyp, zdroj.cilovyId, spravnaUroven)) {
      schvalenoNove++;
    }
  }

  return {
    zkontrolovano: davka.length,
    opravenoZdroju,
    schvalenoNove,
    posledniId: davka.length ? davka[davka.length - 1].id : kurzor,
    hotovo: davka.length < limitNaDavku,
  };
}

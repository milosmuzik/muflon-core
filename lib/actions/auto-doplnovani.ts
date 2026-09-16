"use server";

import { revalidatePath } from "next/cache";
import { stavRozpoctu, zbyvaProAutomatiku } from "@/lib/agent/rozpocet";
import { doplnitKatalogDavku } from "@/lib/agent/doplnit-katalog";
import { doplnitVyrociZKatalogu } from "@/lib/agent/vyroci-z-katalogu";
import { doplnitChybejiciPribehy } from "@/lib/agent/doplnit-pribehy";
import { ROZPOCET_AUTO_DOPLNOVANI_MS } from "@/lib/constants";
import { type RozpocetCasu, sOmezenymCekanim, vytvorRozpocet } from "@/lib/agent/rozpocet-casu";

/**
 * Jedno spuštění = JEDNA kategorie (katalog / výročí / příběhy), nikdy
 * všechny tři za sebou. Kategorie se střídají podle času (rotace po
 * 15minutových oknech) – při volání co 15 minut z cron-job.org se tak v
 * praxi projdou rovnoměrně všechny tři.
 *
 * Časová bezpečnost teď stojí na SDÍLENÉM rozpočtu (ROZPOCET_AUTO_DOPLNOVANI_MS,
 * viz lib/agent/rozpocet-casu.ts), ne na jednom Promise.race kolem celé
 * dávky jako dřív. Rozdíl je podstatný: rozpočet je provázaný se VŠEMI
 * jednotlivými síťovými voláními uvnitř (MusicBrainz, Metal Archives,
 * Gemini), takže je dokáže doopravdy přerušit (signal.abort), místo aby na
 * pozadí běžely dál i po "timeoutu" – a navíc kryje i práci před a po
 * samotné dávce (kontrola/aktualizace Gemini rozpočtu, revalidatePath),
 * což starší řešení nechávalo bez ochrany úplně.
 */
const DAVKA_KATALOG = 1;
const DAVKA_VYROCI = 4;
const DAVKA_PRIBEHY = 6;

type Kategorie = "katalog" | "vyroci" | "pribehy";

function vyberKategorii(): Kategorie {
  const okno = Math.floor(Date.now() / (15 * 60 * 1000));
  const poradi: Kategorie[] = ["katalog", "vyroci", "pribehy"];
  return poradi[okno % 3];
}

export type VysledekAutoDoplnovani = {
  kategorie: Kategorie;
  katalog: { zpracovano: number; doplneno: number };
  vyroci: { alba: number; hudebnici: number; doplnenaData: number };
  pribehy: { zeSablony: number; zGemini: number };
  zastavenoDuvod: "rozpocet" | "hotovo";
  groundedDnesNaKonci: number;
  chyby: string[];
};

export async function spustitAutomatickeDoplnovani(
  rozpocet: RozpocetCasu = vytvorRozpocet(ROZPOCET_AUTO_DOPLNOVANI_MS)
): Promise<VysledekAutoDoplnovani> {
  try {
    return await spustitJadro(rozpocet);
  } finally {
    rozpocet.uklidit();
  }
}

async function spustitJadro(rozpocet: RozpocetCasu): Promise<VysledekAutoDoplnovani> {
  const chyby: string[] = [];
  const kategorie = vyberKategorii();
  const souhrn: VysledekAutoDoplnovani = {
    kategorie,
    katalog: { zpracovano: 0, doplneno: 0 },
    vyroci: { alba: 0, hudebnici: 0, doplnenaData: 0 },
    pribehy: { zeSablony: 0, zGemini: 0 },
    zastavenoDuvod: "hotovo",
    groundedDnesNaKonci: 0,
    chyby,
  };

  // zbyvaProAutomatiku je čistě DB dotaz (Prisma), který AbortSignal
  // nativně nepodporuje – sOmezenymCekanim proto jen omezuje, jak dlouho
  // NA NĚJ čekáme (nedokáže ho zevnitř zrušit). Cíl je vrátit se s jasnou
  // chybou místo viset až do tvrdého zabití funkce Vercelem, kdyby byl
  // Neon výjimečně pomalý/studený.
  let zbyva: number;
  try {
    zbyva = await sOmezenymCekanim(zbyvaProAutomatiku(), "Kontrola Gemini rozpočtu", 8000);
  } catch (e) {
    chyby.push(`Kontrola rozpočtu Gemini selhala: ${(e as Error).message}`);
    souhrn.zastavenoDuvod = "rozpocet";
    return souhrn;
  }
  if (zbyva <= 0) {
    souhrn.zastavenoDuvod = "rozpocet";
    try {
      souhrn.groundedDnesNaKonci = (await sOmezenymCekanim(stavRozpoctu(), "Stav rozpočtu", 8000)).groundedDnes;
    } catch (e) {
      chyby.push((e as Error).message);
    }
    return souhrn;
  }

  try {
    if (kategorie === "katalog") {
      const v = await doplnitKatalogDavku(DAVKA_KATALOG, rozpocet);
      souhrn.katalog.zpracovano = v.zpracovano;
      souhrn.katalog.doplneno = v.doplneno;
      chyby.push(...v.chyby);
    } else if (kategorie === "vyroci") {
      const v = await doplnitVyrociZKatalogu(DAVKA_VYROCI, rozpocet);
      souhrn.vyroci.alba = v.alba;
      souhrn.vyroci.hudebnici = v.hudebnici;
      souhrn.vyroci.doplnenaData = v.doplnenaData;
      chyby.push(...v.chyby);
    } else {
      const v = await doplnitChybejiciPribehy(DAVKA_PRIBEHY, rozpocet);
      souhrn.pribehy.zeSablony = v.zeSablony;
      souhrn.pribehy.zGemini = v.zGemini;
      chyby.push(...v.chyby);
    }
  } catch (e) {
    chyby.push(`${kategorie}: ${(e as Error).message || "selhalo"}`);
  }

  try {
    souhrn.groundedDnesNaKonci = (await sOmezenymCekanim(stavRozpoctu(), "Stav rozpočtu", 8000)).groundedDnes;
  } catch (e) {
    chyby.push((e as Error).message);
  }

  revalidatePath("/kontrola");
  revalidatePath("/interpreti");
  revalidatePath("/hudebnici");
  revalidatePath("/alba");
  revalidatePath("/pribehy");
  revalidatePath("/udalosti");
  revalidatePath("/kalendar");

  return souhrn;
}

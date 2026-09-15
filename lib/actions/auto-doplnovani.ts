"use server";

import { revalidatePath } from "next/cache";
import { stavRozpoctu, zbyvaProAutomatiku } from "@/lib/agent/rozpocet";
import { doplnitKatalogDavku } from "@/lib/agent/doplnit-katalog";
import { doplnitVyrociZKatalogu } from "@/lib/agent/vyroci-z-katalogu";
import { doplnitChybejiciPribehy } from "@/lib/agent/doplnit-pribehy";

/**
 * Jedno spuštění = JEDNA kategorie (katalog / výročí / příběhy), nikdy
 * všechny tři za sebou. Kategorie se střídají podle času (rotace po
 * 15minutových oknech) – při volání co 15 minut z cron-job.org se tak v
 * praxi projdou rovnoměrně všechny tři.
 *
 * Důvod: doplnitKatalogDavku dělá pro KAŽDOU položku v dávce sekvenční
 * volání na MusicBrainz i Metal Archives (až 8 s timeout na každé) – i malá
 * dávka tak v nejhorším případě (obě služby pomalé/nedostupné) může trvat
 * desítky sekund. Spuštění víc kategorií za sebou v jednom běhu tyhle časy
 * sčítalo a snadno přesáhlo 60s tvrdý strop Vercelu (přesně tohle způsobilo
 * 504 při prvním ostrém testu). Jedna kategorie na spuštění drží worst-case
 * bezpečně pod stropem – čísla u DAVKA_* níž jsou spočtená proti tomuhle:
 *   - katalog (1 položka): až 2×8s (MA+MB) + pauzy + až 25s Gemini ≈ 42s
 *   - výročí (jen MusicBrainz, bez umělé pauzy): 4×8s ≈ 32s
 *   - příběhy (jedno dávkové Gemini volání bez ohledu na počet položek): ≈25s
 */
const DAVKA_KATALOG = 1;
const DAVKA_VYROCI = 4;
const DAVKA_PRIBEHY = 6;

/**
 * Tvrdý vnitřní strop na zpracování - bez ohledu na PŘÍČINU pomalosti
 * (pomalé MusicBrainz/Metal Archives, "studená" Neon databáze po
 * nečinnosti, cokoliv jiného) se funkce vždy vrátí nejpozději za tuhle
 * dobu, ať ji Vercel nezabije tvrdě po 60 s bez jakékoliv odpovědi.
 */
const VNITRNI_TIMEOUT_MS = 45_000;

function sTimeoutem<T>(slib: Promise<T>, popis: string): Promise<T> {
  return Promise.race([
    slib,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${popis}: překročen vnitřní limit ${VNITRNI_TIMEOUT_MS / 1000}s`)), VNITRNI_TIMEOUT_MS)
    ),
  ]);
}

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

export async function spustitAutomatickeDoplnovani(): Promise<VysledekAutoDoplnovani> {
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

  const zbyva = await zbyvaProAutomatiku();
  if (zbyva <= 0) {
    souhrn.zastavenoDuvod = "rozpocet";
    souhrn.groundedDnesNaKonci = (await stavRozpoctu()).groundedDnes;
    return souhrn;
  }

  try {
    if (kategorie === "katalog") {
      const v = await sTimeoutem(doplnitKatalogDavku(DAVKA_KATALOG), "Katalog");
      souhrn.katalog.zpracovano = v.zpracovano;
      souhrn.katalog.doplneno = v.doplneno;
      chyby.push(...v.chyby);
    } else if (kategorie === "vyroci") {
      const v = await sTimeoutem(doplnitVyrociZKatalogu(DAVKA_VYROCI), "Výročí");
      souhrn.vyroci.alba = v.alba;
      souhrn.vyroci.hudebnici = v.hudebnici;
      souhrn.vyroci.doplnenaData = v.doplnenaData;
      chyby.push(...v.chyby);
    } else {
      const v = await sTimeoutem(doplnitChybejiciPribehy(DAVKA_PRIBEHY), "Příběhy");
      souhrn.pribehy.zeSablony = v.zeSablony;
      souhrn.pribehy.zGemini = v.zGemini;
      chyby.push(...v.chyby);
    }
  } catch (e) {
    chyby.push(`${kategorie}: ${(e as Error).message || "selhalo"}`);
  }

  souhrn.groundedDnesNaKonci = (await stavRozpoctu()).groundedDnes;

  revalidatePath("/kontrola");
  revalidatePath("/interpreti");
  revalidatePath("/hudebnici");
  revalidatePath("/alba");
  revalidatePath("/pribehy");
  revalidatePath("/udalosti");
  revalidatePath("/kalendar");

  return souhrn;
}

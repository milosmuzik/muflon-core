"use server";

import { revalidatePath } from "next/cache";
import { stavRozpoctu, zbyvaProAutomatiku } from "@/lib/agent/rozpocet";
import { doplnitKatalogDavku } from "@/lib/agent/doplnit-katalog";
import { doplnitVyrociZKatalogu } from "@/lib/agent/vyroci-z-katalogu";
import { doplnitChybejiciPribehy } from "@/lib/agent/doplnit-pribehy";

/**
 * Bezpečné časové okno na 1 spuštění. Endpoint má maxDuration 60 (Hobby
 * strop) – tohle je vědomě výrazně níž, protože tahle automatika má v rámci
 * sdíleného Vercel účtu nejnižší prioritu (muflon-core a muflon-stats musí
 * vždy běžet, viz [[muflon-core]]). Radši skončit dřív a nechat prostor pro
 * ně, než balancovat na hraně tvrdého timeoutu.
 */
const CASOVY_ROZPOCET_MS = 30_000;

const DAVKA_KATALOG = 4;
const DAVKA_VYROCI = 4;
const DAVKA_PRIBEHY = 6;

export type VysledekAutoDoplnovani = {
  kol: number;
  katalog: { zpracovano: number; doplneno: number };
  vyroci: { alba: number; hudebnici: number; doplnenaData: number };
  pribehy: { zeSablony: number; zGemini: number };
  zastavenoDuvod: "cas" | "rozpocet" | "nicKDoplneni";
  groundedDnesNaKonci: number;
  chyby: string[];
};

export async function spustitAutomatickeDoplnovani(): Promise<VysledekAutoDoplnovani> {
  const zacatek = Date.now();
  const chyby: string[] = [];
  const souhrn: VysledekAutoDoplnovani = {
    kol: 0,
    katalog: { zpracovano: 0, doplneno: 0 },
    vyroci: { alba: 0, hudebnici: 0, doplnenaData: 0 },
    pribehy: { zeSablony: 0, zGemini: 0 },
    zastavenoDuvod: "nicKDoplneni",
    groundedDnesNaKonci: 0,
    chyby,
  };

  let hotovoKatalog = false;
  let hotovoVyroci = false;
  let hotovoPribehy = false;

  while (true) {
    if (Date.now() - zacatek > CASOVY_ROZPOCET_MS) {
      souhrn.zastavenoDuvod = "cas";
      break;
    }

    const zbyva = await zbyvaProAutomatiku();
    if (zbyva <= 0) {
      souhrn.zastavenoDuvod = "rozpocet";
      break;
    }

    if (hotovoKatalog && hotovoVyroci && hotovoPribehy) {
      souhrn.zastavenoDuvod = "nicKDoplneni";
      break;
    }

    souhrn.kol += 1;
    let necoSeStalo = false;

    if (!hotovoKatalog) {
      try {
        const v = await doplnitKatalogDavku(DAVKA_KATALOG);
        souhrn.katalog.zpracovano += v.zpracovano;
        souhrn.katalog.doplneno += v.doplneno;
        chyby.push(...v.chyby);
        if (v.zpracovano === 0) hotovoKatalog = true;
        else necoSeStalo = true;
      } catch (e) {
        chyby.push(`Katalog: ${(e as Error).message || "selhalo"}`);
        hotovoKatalog = true;
      }
    }

    if (!hotovoVyroci) {
      try {
        const v = await doplnitVyrociZKatalogu(DAVKA_VYROCI);
        souhrn.vyroci.alba += v.alba;
        souhrn.vyroci.hudebnici += v.hudebnici;
        souhrn.vyroci.doplnenaData += v.doplnenaData;
        chyby.push(...v.chyby);
        if (v.alba === 0 && v.hudebnici === 0) hotovoVyroci = true;
        else necoSeStalo = true;
      } catch (e) {
        chyby.push(`Výročí: ${(e as Error).message || "selhalo"}`);
        hotovoVyroci = true;
      }
    }

    if (!hotovoPribehy) {
      try {
        const v = await doplnitChybejiciPribehy(DAVKA_PRIBEHY);
        souhrn.pribehy.zeSablony += v.zeSablony;
        souhrn.pribehy.zGemini += v.zGemini;
        chyby.push(...v.chyby);
        if (v.zeSablony === 0 && v.zGemini === 0 && v.zbyva === 0) hotovoPribehy = true;
        else necoSeStalo = true;
      } catch (e) {
        chyby.push(`Příběhy: ${(e as Error).message || "selhalo"}`);
        hotovoPribehy = true;
      }
    }

    if (!necoSeStalo && hotovoKatalog && hotovoVyroci && hotovoPribehy) {
      souhrn.zastavenoDuvod = "nicKDoplneni";
      break;
    }
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

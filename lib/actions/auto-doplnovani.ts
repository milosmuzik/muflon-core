"use server";

import { revalidatePath } from "next/cache";
import { stavRozpoctu, zbyvaProAutomatiku } from "@/lib/agent/rozpocet";
import { doplnitKatalogDavku } from "@/lib/agent/doplnit-katalog";
import { doplnitVyrociZKatalogu } from "@/lib/agent/vyroci-z-katalogu";
import { doplnitChybejiciPribehy } from "@/lib/agent/doplnit-pribehy";
import { ROZPOCET_AUTO_DOPLNOVANI_MS } from "@/lib/constants";
import { type RozpocetCasu, sOmezenymCekanim, vytvorRozpocet } from "@/lib/agent/rozpocet-casu";

const DAVKA_KATALOG = 3;
const DAVKA_VYROCI = 8;
const DAVKA_PRIBEHY = 6;

type Kategorie = "katalog" | "vyroci" | "pribehy";

function vyberKategorii(): Kategorie {
  const okno = Math.floor(Date.now() / (15 * 60 * 1000));
  const poradi: Kategorie[] = ["katalog", "vyroci", "pribehy"];
  return poradi[okno % 3];
}

function poradiKategorii(): Kategorie[] {
  const start = vyberKategorii();
  const vse: Kategorie[] = ["katalog", "vyroci", "pribehy"];
  const i = vse.indexOf(start);
  return [...vse.slice(i), ...vse.slice(0, i)];
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

  for (const kat of poradiKategorii()) {
    if (rozpocet.vyprsel()) {
      souhrn.zastavenoDuvod = "rozpocet";
      chyby.push(`Časový rozpočet vyčerpán před kategorií '${kat}'.`);
      break;
    }
    try {
      zbyva = await sOmezenymCekanim(zbyvaProAutomatiku(), "Kontrola Gemini rozpočtu", 8000);
    } catch (e) {
      chyby.push((e as Error).message);
      souhrn.zastavenoDuvod = "rozpocet";
      break;
    }
    if (zbyva <= 0) {
      souhrn.zastavenoDuvod = "rozpocet";
      break;
    }
    try {
      if (kat === "katalog") {
        const v = await doplnitKatalogDavku(DAVKA_KATALOG, rozpocet);
        souhrn.katalog.zpracovano += v.zpracovano;
        souhrn.katalog.doplneno += v.doplneno;
        chyby.push(...v.chyby);
      } else if (kat === "vyroci") {
        const v = await doplnitVyrociZKatalogu(DAVKA_VYROCI, rozpocet);
        souhrn.vyroci.alba += v.alba;
        souhrn.vyroci.hudebnici += v.hudebnici;
        souhrn.vyroci.doplnenaData += v.doplnenaData;
        chyby.push(...v.chyby);
      } else {
        const v = await doplnitChybejiciPribehy(DAVKA_PRIBEHY, rozpocet);
        souhrn.pribehy.zeSablony += v.zeSablony;
        souhrn.pribehy.zGemini += v.zGemini;
        chyby.push(...v.chyby);
      }
    } catch (e) {
      chyby.push(`${kat}: ${(e as Error).message || "selhalo"}`);
    }
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

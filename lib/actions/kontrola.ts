"use server";

import { revalidatePath } from "next/cache";
import { dohledatChybejiciZdroje, type VysledekDohledani } from "@/lib/agent/dohledat-zdroje-hromadne";
import { revidovatVse, type VysledekRevizeVse } from "@/lib/agent/revize-vse";
import { smazatNekvalifikovane, type VysledekUklidu } from "@/lib/agent/uklid";
import { slouciDuplicitniUdalosti, type VysledekSlouceni } from "@/lib/agent/duplicity";
import { spustitAutomatickouRevizi, type VysledekAutomatickeRevize } from "@/lib/agent/automaticka-revize";
import { opravitFeatDavku, type VysledekUkliduFeat } from "@/lib/agent/uklid-feat";
import {
  doplnitAlbum,
  doplnitHudebnika,
  doplnitKatalogDavku,
  type VysledekDoplneni,
} from "@/lib/agent/doplnit-katalog";
import { smazatOdpadoveInterprety, type VysledekUkliduOdpadu } from "@/lib/agent/uklid-odpad";
import { doplnitVyrociZKatalogu, type VysledekVyroci } from "@/lib/agent/vyroci-z-katalogu";
import { doplnitChybejiciPribehy, type VysledekPribehu } from "@/lib/agent/doplnit-pribehy";
import { ROZPOCET_SDRUZENA_KONTROLA_MS } from "@/lib/constants";
import { type RozpocetCasu, vytvorRozpocet } from "@/lib/agent/rozpocet-casu";

function revalidateKontrola() {
  revalidatePath("/kontrola");
  revalidatePath("/pribehy");
  revalidatePath("/udalosti");
  revalidatePath("/kalendar");
  revalidatePath("/interpreti");
  revalidatePath("/hudebnici");
  revalidatePath("/alba");
  revalidatePath("/skladby");
}

const PRAZDNY_VYSLEDEK: VysledekAutomatickeRevize = {
  schvaleno: 0,
  smazanoNedostatecnyZdroj: 0,
  dohledano: 0,
  smazanoBezZdroje: 0,
  sloucenoDuplicit: 0,
  zbyva: 0,
  hotovo: false,
  chyby: [],
};

export type VysledekSdruzeneKontroly = {
  odpad: VysledekUkliduOdpadu;
  vyroci: VysledekVyroci;
  katalog: VysledekDoplneni;
  feat: VysledekUkliduFeat;
  zdroje: VysledekDohledani;
  revize: VysledekAutomatickeRevize;
  chyby: string[];
};

/**
 * Šest kroků níž dřív běželo úplně bez časové ochrany (jen dávky byly
 * zmenšené, viz komentáře u jednotlivých volání) – to byl hlavní zdroj
 * opakovaných 504 FUNCTION_INVOCATION_TIMEOUT (viz redakční poznámka u
 * EXTERNI_ZDROJ_TIMEOUT_MS v lib/constants.ts). Teď sdílí JEDEN časový
 * rozpočet (rozpocet, výchozí ROZPOCET_SDRUZENA_KONTROLA_MS): mezi kroky se
 * kontroluje, jestli ještě zbývá čas, a pokud ne, zbylé kroky se vůbec
 * nezačnou (radši dokončit první 3-4 kroky pořádně, než rozjet všech 6 a
 * nechat je useknout uprostřed). Stejný rozpočet dál pokračuje i do
 * navrhy-kalendar.ts, který se volá HNED PO téhle funkci ve stejné route
 * (app/api/cron/sdruzena-kontrola/route.ts) - dřív to byly dvě na sobě
 * nezávislé, obě neomezené fáze.
 */
export async function spustitSdruzeneKontrolu(
  rozpocet: RozpocetCasu = vytvorRozpocet(ROZPOCET_SDRUZENA_KONTROLA_MS)
): Promise<VysledekSdruzeneKontroly> {
  const chyby: string[] = [];
  let odpad: VysledekUkliduOdpadu = { nalezeno: 0, smazano: 0, nazvy: [] };
  let vyroci: VysledekVyroci = { alba: 0, hudebnici: 0, doplnenaData: 0, preskoceno: 0, chyby: [] };
  let katalog: VysledekDoplneni = { zpracovano: 0, doplneno: 0, zdroje: 0, polozky: [], chyby: [] };
  let feat: VysledekUkliduFeat = {
    opravenoInterpretu: 0,
    napojenoHostu: 0,
    slouceno: 0,
    zbyva: 0,
    hotovo: false,
    chyby: [],
  };
  let zdroje: VysledekDohledani = {
    zkontrolovano: 0,
    nalezeno: 0,
    smazano: 0,
    preskocenoKvota: 0,
    chyby: [],
  };
  let revize: VysledekAutomatickeRevize = { ...PRAZDNY_VYSLEDEK };

  // Krok 1 (úklid odpadu): čistě DB, žádná síťová volání, běžně řádově
  // milisekundy až jednotky sekund i pro desítky záznamů - proto běží vždy,
  // bez podmínky na rozpočet, ať se aspoň tenhle levný úklid stihne i pod
  // časovým tlakem.
  try {
    odpad = await smazatOdpadoveInterprety();
  } catch (e) {
    chyby.push((e as Error).message || "Úklid odpadu selhal.");
  }

  // Krok 2 (oprava feat): taky čistě DB, žádná síťová volání.
  if (!rozpocet.vyprsel()) {
    try {
      feat = await opravitFeatDavku();
      chyby.push(...feat.chyby);
    } catch (e) {
      chyby.push((e as Error).message || "Oprava feat selhala.");
    }
  } else {
    chyby.push("Časový rozpočet vyčerpán před krokem 'oprava feat' – přeskočeno, doběhne příště.");
  }

  if (!rozpocet.vyprsel()) {
    try {
      vyroci = await doplnitVyrociZKatalogu(4, rozpocet);
      chyby.push(...vyroci.chyby);
    } catch (e) {
      chyby.push((e as Error).message || "Výročí z katalogu selhala.");
    }
  } else {
    chyby.push("Časový rozpočet vyčerpán před krokem 'výročí z katalogu' – přeskočeno, doběhne příště.");
  }

  if (!rozpocet.vyprsel()) {
    try {
      // Zmenšeno z 6 na 4 kvůli 60s stropu na Hobby (dřív mělo 300s). Katalog
      // teď navíc dostává mnohem větší dávky průběžně přes den z nové
      // automatiky (lib/actions/auto-doplnovani.ts, cron-job.org co 15 min).
      katalog = await doplnitKatalogDavku(4, rozpocet);
      chyby.push(...katalog.chyby);
    } catch (e) {
      chyby.push((e as Error).message || "Doplnění katalogu selhalo.");
    }
  } else {
    chyby.push("Časový rozpočet vyčerpán před krokem 'doplnění katalogu' – přeskočeno, doběhne příště.");
  }

  if (!rozpocet.vyprsel()) {
    try {
      // Zmenšeno z 10 na 5 kvůli 60s stropu na Hobby (dřív mělo 300s).
      zdroje = await dohledatChybejiciZdroje(5, rozpocet);
      chyby.push(...zdroje.chyby);
    } catch (e) {
      chyby.push((e as Error).message || "Dohledání zdrojů selhalo.");
    }
  } else {
    chyby.push("Časový rozpočet vyčerpán před krokem 'dohledání zdrojů' – přeskočeno, doběhne příště.");
  }

  if (!rozpocet.vyprsel()) {
    try {
      revize = await spustitAutomatickouRevizi(rozpocet);
      chyby.push(...revize.chyby);
    } catch (e) {
      chyby.push((e as Error).message || "Revize selhala.");
    }
  } else {
    chyby.push("Časový rozpočet vyčerpán před krokem 'automatická revize' – přeskočeno, doběhne příště.");
  }

  revalidateKontrola();
  return { odpad, vyroci, katalog, feat, zdroje, revize, chyby: chyby.slice(-12) };
}

export async function spustitUklidOdpadu(): Promise<VysledekUkliduOdpadu> {
  const v = await smazatOdpadoveInterprety();
  revalidateKontrola();
  return v;
}

export async function spustitVyrociZKatalogu(): Promise<VysledekVyroci> {
  const v = await doplnitVyrociZKatalogu(6);
  revalidateKontrola();
  return v;
}

export async function spustitDoplneniPribehu(): Promise<VysledekPribehu> {
  try {
    const v = await doplnitChybejiciPribehy(10);
    revalidateKontrola();
    return v;
  } catch (e) {
    return {
      zeSablony: 0,
      zGemini: 0,
      preskoceno: 0,
      zbyva: 0,
      chyby: [(e as Error).message || "Psaní příběhů selhalo."],
    };
  }
}

export async function spustitAutomatickouReviziRucne(
  _predchoziStav: VysledekAutomatickeRevize | null,
  _formData?: FormData
): Promise<VysledekAutomatickeRevize> {
  try {
    const vysledek = await spustitAutomatickouRevizi();
    revalidateKontrola();
    return vysledek;
  } catch (e) {
    return {
      ...PRAZDNY_VYSLEDEK,
      chyby: [(e as Error).message || "Revize selhala."],
    };
  }
}

export async function spustitOpravuFeatRucne(): Promise<VysledekUkliduFeat> {
  try {
    const vysledek = await opravitFeatDavku();
    revalidatePath("/kontrola");
    revalidatePath("/interpreti");
    revalidatePath("/skladby");
    return vysledek;
  } catch (e) {
    return {
      opravenoInterpretu: 0,
      napojenoHostu: 0,
      slouceno: 0,
      zbyva: 0,
      hotovo: false,
      chyby: [(e as Error).message || "Oprava feat selhala."],
    };
  }
}

export async function spustitDohledaniRucne(
  _predchoziStav: VysledekDohledani,
  _formData: FormData
): Promise<VysledekDohledani> {
  try {
    const vysledek = await dohledatChybejiciZdroje(8);
    revalidateKontrola();
    return vysledek;
  } catch (e) {
    return { zkontrolovano: 0, nalezeno: 0, smazano: 0, preskocenoKvota: 0, chyby: [(e as Error).message] };
  }
}

export async function spustitReviziVseRucne(
  predchoziStav: VysledekRevizeVse,
  formData: FormData
): Promise<VysledekRevizeVse> {
  const kurzor = String(formData.get("kurzor") || "") || null;
  const davka = await revidovatVse(kurzor);
  revalidateKontrola();
  return {
    zkontrolovano: predchoziStav.zkontrolovano + davka.zkontrolovano,
    opravenoZdroju: predchoziStav.opravenoZdroju + davka.opravenoZdroju,
    schvalenoNove: predchoziStav.schvalenoNove + davka.schvalenoNove,
    posledniId: davka.posledniId,
    hotovo: davka.hotovo,
  };
}

export async function spustitUklidRucne(
  _predchoziStav: VysledekUklidu,
  _formData: FormData
): Promise<VysledekUklidu> {
  const vysledek = await smazatNekvalifikovane();
  revalidateKontrola();
  return vysledek;
}

export async function spustitSlouceniRucne(
  _predchoziStav: VysledekSlouceni,
  _formData: FormData
): Promise<VysledekSlouceni> {
  const vysledek = await slouciDuplicitniUdalosti();
  revalidateKontrola();
  return vysledek;
}

export async function spustitDoplneniKatalogu(
  _predchozi: VysledekDoplneni,
  _formData: FormData
): Promise<VysledekDoplneni> {
  try {
    const vysledek = await doplnitKatalogDavku(4);
    revalidatePath("/kontrola");
    revalidatePath("/hudebnici");
    revalidatePath("/alba");
    revalidatePath("/");
    return vysledek;
  } catch (e) {
    return { zpracovano: 0, doplneno: 0, zdroje: 0, polozky: [], chyby: [(e as Error).message] };
  }
}

export async function spustitDoplneniZaznamu(
  typ: "Hudebnik" | "Album",
  id: string
): Promise<{ ok: boolean; text: string; zmeny: string[]; zdroje: string[] }> {
  try {
    const r = typ === "Hudebnik" ? await doplnitHudebnika(id) : await doplnitAlbum(id);
    revalidatePath(typ === "Hudebnik" ? `/hudebnici/${id}` : `/alba/${id}`);
    revalidatePath("/kontrola");
    const nic = r.zmeny.length === 0 && r.zdroje.length === 0;
    return {
      ok: true,
      text: nic ? "Nic nového se nenašlo. Záznam zůstává." : `Našlo se u ${r.nazev}:`,
      zmeny: r.zmeny,
      zdroje: r.zdroje,
    };
  } catch (e) {
    return { ok: false, text: (e as Error).message, zmeny: [], zdroje: [] };
  }
}

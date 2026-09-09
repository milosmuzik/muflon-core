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

export async function spustitSdruzeneKontrolu(): Promise<VysledekSdruzeneKontroly> {
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

  try {
    odpad = await smazatOdpadoveInterprety();
  } catch (e) {
    chyby.push((e as Error).message || "Úklid odpadu selhal.");
  }

  try {
    feat = await opravitFeatDavku();
    chyby.push(...feat.chyby);
  } catch (e) {
    chyby.push((e as Error).message || "Oprava feat selhala.");
  }

  try {
    vyroci = await doplnitVyrociZKatalogu(4);
    chyby.push(...vyroci.chyby);
  } catch (e) {
    chyby.push((e as Error).message || "Výročí z katalogu selhala.");
  }

  try {
    katalog = await doplnitKatalogDavku(4);
    chyby.push(...katalog.chyby);
  } catch (e) {
    chyby.push((e as Error).message || "Doplnění katalogu selhalo.");
  }

  try {
    zdroje = await dohledatChybejiciZdroje(8);
    chyby.push(...zdroje.chyby);
  } catch (e) {
    chyby.push((e as Error).message || "Dohledání zdrojů selhalo.");
  }

  try {
    revize = await spustitAutomatickouRevizi();
    chyby.push(...revize.chyby);
  } catch (e) {
    chyby.push((e as Error).message || "Revize selhala.");
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
  const v = await doplnitChybejiciPribehy(10);
  revalidateKontrola();
  return v;
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

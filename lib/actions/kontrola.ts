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

function revalidateKontrola() {
  revalidatePath("/kontrola");
  revalidatePath("/pribehy");
  revalidatePath("/udalosti");
  revalidatePath("/kalendar");
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
    return { zkontrolovano: 0, nalezeno: 0, smazano: 0, chyby: [(e as Error).message] };
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
    return { zpracovano: 0, doplneno: 0, zdroje: 0, chyby: [(e as Error).message] };
  }
}

export async function spustitDoplneniZaznamu(
  typ: "Hudebnik" | "Album",
  id: string
): Promise<{ ok: boolean; text: string }> {
  try {
    const r = typ === "Hudebnik" ? await doplnitHudebnika(id) : await doplnitAlbum(id);
    revalidatePath(typ === "Hudebnik" ? `/hudebnici/${id}` : `/alba/${id}`);
    revalidatePath("/kontrola");
    if (!r.doplneno) return { ok: true, text: "Nic nového se nenašlo. Záznam zůstává." };
    return { ok: true, text: `Doplněno, zdrojů +${r.zdroje}. Nic se nemazalo.` };
  } catch (e) {
    return { ok: false, text: (e as Error).message };
  }
}

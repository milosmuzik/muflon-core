"use server";

import { revalidatePath } from "next/cache";
import { dohledatChybejiciZdroje, type VysledekDohledani } from "@/lib/agent/dohledat-zdroje-hromadne";
import { revidovatVse, type VysledekRevizeVse } from "@/lib/agent/revize-vse";
import { smazatNekvalifikovane, type VysledekUklidu } from "@/lib/agent/uklid";
import { slouciDuplicitniUdalosti, type VysledekSlouceni } from "@/lib/agent/duplicity";
import { spustitAutomatickouRevizi, type VysledekAutomatickeRevize } from "@/lib/agent/automaticka-revize";

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

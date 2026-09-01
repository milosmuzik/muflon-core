"use server";

import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
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
}

export async function vratitBezZdrojeNaNavrh() {
  const pribehy = await prisma.pribeh.findMany({ where: { stav: { not: "navrh" } } });
  for (const pribeh of pribehy) {
    const pocetZdroju = await prisma.zdroj.count({ where: { cilovyTyp: "Pribeh", cilovyId: pribeh.id } });
    if (pocetZdroju === 0) {
      await prisma.pribeh.update({ where: { id: pribeh.id }, data: { stav: "navrh" } });
      await zapisHistorii("Pribeh", pribeh.id, "zmena_stavu", `${pribeh.stav} → navrh (vráceno při kontrole – bez zdroje)`);
    }
  }

  const udalosti = await prisma.udalost.findMany({ where: { stav: { not: "navrh" } } });
  for (const udalost of udalosti) {
    const pocetZdroju = await prisma.zdroj.count({ where: { cilovyTyp: "Udalost", cilovyId: udalost.id } });
    if (pocetZdroju === 0) {
      await prisma.udalost.update({ where: { id: udalost.id }, data: { stav: "navrh" } });
      await zapisHistorii("Udalost", udalost.id, "zmena_stavu", `${udalost.stav} → navrh (vráceno při kontrole – bez zdroje)`);
    }
  }

  revalidateKontrola();
}

export async function spustitDohledaniRucne(
  _predchoziStav: VysledekDohledani,
  _formData: FormData
): Promise<VysledekDohledani> {
  try {
    const vysledek = await dohledatChybejiciZdroje();
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
  revalidatePath("/kalendar");
  return vysledek;
}

export async function spustitAutomatickouReviziRucne(
  _predchoziStav: VysledekAutomatickeRevize | null,
  _formData: FormData
): Promise<VysledekAutomatickeRevize> {
  try {
    const vysledek = await spustitAutomatickouRevizi();
    revalidateKontrola();
    revalidatePath("/kalendar");
    return vysledek;
  } catch (e) {
    return {
      vracenoNaNavrh: 0,
      dohledano: 0,
      smazanoBezZdroje: 0,
      revidovanoZdroju: 0,
      schvaleno: 0,
      smazanoPoRevizi: 0,
      chyby: [(e as Error).message || "Revize selhala."],
    };
  }
}

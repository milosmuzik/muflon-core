"use server";

import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { revalidatePath } from "next/cache";
import { dohledatChybejiciZdroje, type VysledekDohledani } from "@/lib/agent/dohledat-zdroje-hromadne";
import { revidovatVse, type VysledekRevizeVse } from "@/lib/agent/revize-vse";

// Vrátí příběhy a události, které mají stav dál než "návrh" (tedy se tváří
// jako ověřené/schválené/publikované), ale nemají v databázi žádný zdroj –
// to je rozpor s principem "bez zdroje je údaj jen tvrzením, ne ověřenou
// znalostí" (kap. 4.4 Ověřitelnost). Vznikaly hlavně starým importem karet,
// který stav nastavoval napevno bez ohledu na zdroje.
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

  revalidatePath("/kontrola");
  revalidatePath("/pribehy");
  revalidatePath("/udalosti");
}

export async function spustitDohledaniRucne(
  _predchoziStav: VysledekDohledani,
  _formData: FormData
): Promise<VysledekDohledani> {
  const vysledek = await dohledatChybejiciZdroje();
  revalidatePath("/kontrola");
  revalidatePath("/pribehy");
  revalidatePath("/udalosti");
  return vysledek;
}

// Jediné, centrální dávkové tlačítko revize - viz lib/agent/revize-vse.ts.
// Nahrazuje dřívější roztroušené funkce (revidovatUdalosti, revidovatPribehy,
// opravitGoogleRedirecty), které dělaly téměř totéž na třech různých
// místech a každou další chybu bylo nutné opravovat vícekrát.
export async function spustitReviziVseRucne(
  predchoziStav: VysledekRevizeVse,
  formData: FormData
): Promise<VysledekRevizeVse> {
  const kurzor = String(formData.get("kurzor") || "") || null;
  const davka = await revidovatVse(kurzor);

  revalidatePath("/kontrola");
  revalidatePath("/pribehy");
  revalidatePath("/udalosti");

  return {
    zkontrolovano: predchoziStav.zkontrolovano + davka.zkontrolovano,
    opravenoZdroju: predchoziStav.opravenoZdroju + davka.opravenoZdroju,
    schvalenoNove: predchoziStav.schvalenoNove + davka.schvalenoNove,
    posledniId: davka.posledniId,
    hotovo: davka.hotovo,
  };
}

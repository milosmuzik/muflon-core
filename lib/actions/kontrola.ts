"use server";

import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { revalidatePath } from "next/cache";
import { dohledatChybejiciZdroje, type VysledekDohledani } from "@/lib/agent/dohledat-zdroje-hromadne";
import { rozbalRedirect } from "@/lib/agent/redirect";
import { urovenDuveryZeZdroje } from "@/lib/constants";
import { zvazAutomatickeSchvaleni } from "@/lib/actions/spolecne";

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

export type VysledekOpravyRedirectu = {
  zkontrolovano: number;
  opraveno: number;
  zvysenaDuvera: number;
};

// Zdroje vytvořené AI agenty (Gemini + google_search) měly URL uloženou
// jako Google grounding redirect (vertexaisearch.cloud.google.com/...),
// ne jako skutečnou adresu zdroje - whitelist renomovaných domén tak u
// nich nikdy nenašel shodu a spadly na "neověřené" bez ohledu na to, jak
// důvěryhodné médium citovaly. Nově vznikající zdroje se opravují přímo
// v agentech (viz lib/agent/redirect.ts); tohle dávkově opravuje záznamy
// vzniklé před tou opravou.
export async function opravitGoogleRedirecty(
  _predchoziStav: VysledekOpravyRedirectu,
  _formData: FormData
): Promise<VysledekOpravyRedirectu> {
  const limitNaDavku = 20;
  const zaznamy = await prisma.zdroj.findMany({
    where: { url: { contains: "vertexaisearch.cloud.google.com" } },
    take: limitNaDavku,
  });

  let opraveno = 0;
  let zvysenaDuvera = 0;

  for (const z of zaznamy) {
    if (!z.url) continue;
    const skutecnaUrl = await rozbalRedirect(z.url);
    if (skutecnaUrl === z.url) continue; // rozbalení selhalo, zkusí se v příští dávce
    const novaUroven = urovenDuveryZeZdroje(z.kategorie, skutecnaUrl);
    await prisma.zdroj.update({
      where: { id: z.id },
      data: {
        url: skutecnaUrl,
        uroverDuvery: novaUroven,
        datumOvereni: novaUroven !== "neoverene" ? new Date().toISOString().slice(0, 10) : z.datumOvereni,
      },
    });
    opraveno++;
    if (novaUroven !== z.uroverDuvery) {
      zvysenaDuvera++;
      await zapisHistorii(z.cilovyTyp, z.cilovyId, "upraveno", `Opraven Google redirect u zdroje – důvěra: ${z.uroverDuvery} → ${novaUroven}`);
      await zvazAutomatickeSchvaleni(z.cilovyTyp, z.cilovyId, novaUroven);
    }
  }

  revalidatePath("/kontrola");
  revalidatePath("/pribehy");
  revalidatePath("/udalosti");
  return { zkontrolovano: zaznamy.length, opraveno, zvysenaDuvera };
}

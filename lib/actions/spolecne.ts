"use server";

import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { AUTOSCHVALENI_OD_UROVNE, DALSI_STAV, urovenDuveryPriorita } from "@/lib/constants";
import { revalidatePath } from "next/cache";

// Entity s redakčním workflow (navrh -> overeno -> schvaleno -> ...) – jediné,
// u kterých dává smysl automaticky posunout stav podle důvěry zdroje.
const STAVOVE_ENTITY = new Set(["Pribeh", "Udalost"]);

// Pokud přidaný/upravený zdroj má střední nebo vyšší důvěru a záznam ještě
// čeká na schválení (návrh/ověřeno), rovnou ho schvaluje – nemusí se čekat
// na ruční "Posunout stav".
async function zvazAutomatickeSchvaleni(cilovyTyp: string, cilovyId: string, uroverDuvery: string) {
  if (!STAVOVE_ENTITY.has(cilovyTyp)) return;
  if (urovenDuveryPriorita(uroverDuvery) < AUTOSCHVALENI_OD_UROVNE) return;

  const aktualni =
    cilovyTyp === "Pribeh"
      ? await prisma.pribeh.findUnique({ where: { id: cilovyId }, select: { stav: true } })
      : await prisma.udalost.findUnique({ where: { id: cilovyId }, select: { stav: true } });
  if (!aktualni || (aktualni.stav !== "navrh" && aktualni.stav !== "overeno")) return;

  if (cilovyTyp === "Pribeh") {
    await prisma.pribeh.update({ where: { id: cilovyId }, data: { stav: "schvaleno" } });
  } else {
    await prisma.udalost.update({ where: { id: cilovyId }, data: { stav: "schvaleno" } });
  }
  await zapisHistorii(cilovyTyp, cilovyId, "zmena_stavu", "Automaticky schváleno – přidán zdroj se střední nebo vyšší důvěrou");
}

// ---------------------------------------------------------------------------
// Zdroje (kap. 4.4 Ověřitelnost) – polymorfní, funguje pro libovolnou entitu.
// ---------------------------------------------------------------------------
export async function pridatZdroj(
  cilovyTyp: string,
  cilovyId: string,
  cestaZpet: string,
  formData: FormData
) {
  const nazev = String(formData.get("nazev") || "").trim();
  if (!nazev) return;
  const url = String(formData.get("url") || "").trim() || null;
  const kategorie = String(formData.get("kategorie") || "orientacni");
  const uroverDuvery = String(formData.get("uroverDuvery") || "neoverene");
  const poznamka = String(formData.get("poznamka") || "").trim() || null;

  await prisma.zdroj.create({
    data: {
      cilovyTyp,
      cilovyId,
      nazev,
      url,
      kategorie,
      uroverDuvery,
      poznamka,
      datumOvereni: uroverDuvery !== "neoverene" ? new Date().toISOString().slice(0, 10) : null,
    },
  });
  await zapisHistorii(cilovyTyp, cilovyId, "upraveno", `Přidán zdroj: ${nazev}`);
  await zvazAutomatickeSchvaleni(cilovyTyp, cilovyId, uroverDuvery);
  revalidatePath(cestaZpet);
}

export async function smazatZdroj(id: string, cestaZpet: string) {
  const zdroj = await prisma.zdroj.delete({ where: { id } });
  await zapisHistorii(zdroj.cilovyTyp, zdroj.cilovyId, "upraveno", `Odstraněn zdroj: ${zdroj.nazev}`);
  revalidatePath(cestaZpet);
}

// ---------------------------------------------------------------------------
// Vazby (kap. 4.5 Propojenost) – obecná hrana mezi dvěma libovolnými objekty.
// ---------------------------------------------------------------------------
export async function pridatVazbu(
  zdrojovyTyp: string,
  zdrojovyId: string,
  cestaZpet: string,
  formData: FormData
) {
  const cilovyTyp = String(formData.get("cilovyTyp") || "").trim();
  const cilovyNazev = String(formData.get("cilovyNazev") || "").trim();
  const typVztahu = String(formData.get("typVztahu") || "").trim();
  if (!cilovyTyp || !cilovyNazev || !typVztahu) return;

  // Najdi cílový objekt podle názvu v odpovídající tabulce.
  const cilovyId = await najdiIdPodleNazvu(cilovyTyp, cilovyNazev);
  if (!cilovyId) return;

  const poznamka = String(formData.get("poznamka") || "").trim() || null;

  await prisma.vazba.create({
    data: { zdrojovyTyp, zdrojovyId, cilovyTyp, cilovyId, typVztahu, poznamka },
  });
  await zapisHistorii(zdrojovyTyp, zdrojovyId, "upraveno", `Přidána vazba (${typVztahu}) na ${cilovyNazev}`);
  revalidatePath(cestaZpet);
}

export async function smazatVazbu(id: string, cestaZpet: string) {
  const vazba = await prisma.vazba.delete({ where: { id } });
  await zapisHistorii(vazba.zdrojovyTyp, vazba.zdrojovyId, "upraveno", "Odstraněna vazba");
  revalidatePath(cestaZpet);
}

async function najdiIdPodleNazvu(typ: string, nazev: string): Promise<string | null> {
  switch (typ) {
    case "Interpret": {
      const r = await prisma.interpret.findFirst({ where: { nazev: { contains: nazev, mode: "insensitive" as const } } });
      return r?.id ?? null;
    }
    case "Hudebnik": {
      const r = await prisma.hudebnik.findFirst({ where: { jmeno: { contains: nazev, mode: "insensitive" as const } } });
      return r?.id ?? null;
    }
    case "Album": {
      const r = await prisma.album.findFirst({ where: { nazev: { contains: nazev, mode: "insensitive" as const } } });
      return r?.id ?? null;
    }
    case "Skladba": {
      const r = await prisma.skladba.findFirst({ where: { nazev: { contains: nazev, mode: "insensitive" as const } } });
      return r?.id ?? null;
    }
    case "Pribeh": {
      const r = await prisma.pribeh.findFirst({ where: { nadpis: { contains: nazev, mode: "insensitive" as const } } });
      return r?.id ?? null;
    }
    case "Udalost": {
      const r = await prisma.udalost.findFirst({ where: { nazev: { contains: nazev, mode: "insensitive" as const } } });
      return r?.id ?? null;
    }
    default:
      return null;
  }
}

// Vrátí popisné jméno libovolného objektu podle typu a id (pro vypsání vazeb).
export async function nazevObjektu(typ: string, id: string): Promise<string> {
  switch (typ) {
    case "Interpret":
      return (await prisma.interpret.findUnique({ where: { id } }))?.nazev ?? "?";
    case "Hudebnik":
      return (await prisma.hudebnik.findUnique({ where: { id } }))?.jmeno ?? "?";
    case "Album":
      return (await prisma.album.findUnique({ where: { id } }))?.nazev ?? "?";
    case "Skladba":
      return (await prisma.skladba.findUnique({ where: { id } }))?.nazev ?? "?";
    case "Pribeh":
      return (await prisma.pribeh.findUnique({ where: { id } }))?.nadpis ?? "?";
    case "Udalost":
      return (await prisma.udalost.findUnique({ where: { id } }))?.nazev ?? "?";
    default:
      return "?";
  }
}

// ---------------------------------------------------------------------------
// Workflow – posun stavu vpřed (kap. Etapa 3, pracovní stavy)
// ---------------------------------------------------------------------------
export async function posunoutStav(
  model: "pribeh" | "udalost",
  id: string,
  aktualniStav: string,
  cestaZpet: string
) {
  const novyStav = DALSI_STAV[aktualniStav];
  if (!novyStav) return;

  const typ = model === "pribeh" ? "Pribeh" : "Udalost";

  // Bez zdroje je údaj jen tvrzením, ne ověřenou znalostí (kap. 4.4
  // Ověřitelnost) – stav proto nejde posunout dál, dokud záznam nemá
  // aspoň jeden zdroj.
  const pocetZdroju = await prisma.zdroj.count({ where: { cilovyTyp: typ, cilovyId: id } });
  if (pocetZdroju === 0) return;

  if (model === "pribeh") {
    await prisma.pribeh.update({ where: { id }, data: { stav: novyStav } });
  } else {
    await prisma.udalost.update({ where: { id }, data: { stav: novyStav } });
  }
  await zapisHistorii(typ, id, "zmena_stavu", `${aktualniStav} → ${novyStav}`);
  revalidatePath(cestaZpet);
}

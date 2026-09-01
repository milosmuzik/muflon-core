import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import {
  AUTOSCHVALENI_OD_UROVNE,
  urovenDuveryPriorita,
  urovenDuveryZeZdroje,
  nazevZeZdroje,
  POZNAMKA_DOHLEDANO,
} from "@/lib/constants";
import { zvazAutomatickeSchvaleni } from "@/lib/actions/spolecne";
import { dohledatZdroj } from "@/lib/agent/dohledat-zdroj";
import { smazatStavovouEntitu } from "@/lib/agent/uklid";

export type VysledekDohledani = {
  zkontrolovano: number;
  nalezeno: number;
  smazano: number;
  chyby: string[];
};

const CEKAJICI_STAVY = ["navrh", "overeno", "schvaleno"];

async function entityBezZdroje(
  typ: "Pribeh" | "Udalost",
  limit: number
): Promise<{ id: string; nazev: string; obsah: string }[]> {
  if (typ === "Pribeh") {
    const pribehy = await prisma.pribeh.findMany({
      where: { stav: { in: CEKAJICI_STAVY } },
      orderBy: { updatedAt: "asc" },
      select: { id: true, nadpis: true, obsah: true },
    });
    const zdroje = await prisma.zdroj.findMany({ where: { cilovyTyp: "Pribeh" }, select: { cilovyId: true } });
    const maZdroj = new Set(zdroje.map((z) => z.cilovyId));
    return pribehy
      .filter((p) => !maZdroj.has(p.id))
      .slice(0, limit)
      .map((p) => ({ id: p.id, nazev: p.nadpis, obsah: p.obsah }));
  }

  const udalosti = await prisma.udalost.findMany({
    where: { stav: { in: CEKAJICI_STAVY } },
    orderBy: { updatedAt: "asc" },
    select: { id: true, nazev: true, popis: true },
  });
  const zdroje = await prisma.zdroj.findMany({ where: { cilovyTyp: "Udalost" }, select: { cilovyId: true } });
  const maZdroj = new Set(zdroje.map((z) => z.cilovyId));
  return udalosti
    .filter((u) => !maZdroj.has(u.id))
    .slice(0, limit)
    .map((u) => ({ id: u.id, nazev: u.nazev, obsah: u.popis ?? "" }));
}

async function zpracujEntitu(typ: "Pribeh" | "Udalost", entita: { id: string; nazev: string; obsah: string }) {
  const nalez = await dohledatZdroj(entita.nazev, entita.obsah);
  if (!nalez) {
    return (await smazatStavovouEntitu(typ, entita.id)) ? "smazano" : "preskoceno";
  }

  const uroverDuvery = urovenDuveryZeZdroje(nalez.kategorie, nalez.url);
  if (urovenDuveryPriorita(uroverDuvery) < AUTOSCHVALENI_OD_UROVNE) {
    return (await smazatStavovouEntitu(typ, entita.id)) ? "smazano" : "preskoceno";
  }

  await prisma.zdroj.create({
    data: {
      cilovyTyp: typ,
      cilovyId: entita.id,
      nazev: nazevZeZdroje(nalez.url, nalez.nazev),
      url: nalez.url,
      kategorie: nalez.kategorie,
      uroverDuvery,
      poznamka: POZNAMKA_DOHLEDANO,
    },
  });
  await zapisHistorii(typ, entita.id, "upraveno", `AI dohledala zdroj: ${nalez.nazev}`);
  await zvazAutomatickeSchvaleni(typ, entita.id, uroverDuvery);
  return "nalezeno";
}

export async function dohledatChybejiciZdroje(limitNaDavku = 5): Promise<VysledekDohledani> {
  let zkontrolovano = 0;
  let nalezeno = 0;
  let smazano = 0;
  const chyby: string[] = [];

  const pribehy = await entityBezZdroje("Pribeh", limitNaDavku);
  for (const pribeh of pribehy) {
    zkontrolovano++;
    try {
      const vysledek = await zpracujEntitu("Pribeh", pribeh);
      if (vysledek === "nalezeno") nalezeno++;
      if (vysledek === "smazano") smazano++;
    } catch (e) {
      chyby.push(`Příběh „${pribeh.nazev}“: ${(e as Error).message}`);
    }
  }

  const udalosti = await entityBezZdroje("Udalost", limitNaDavku);
  for (const udalost of udalosti) {
    zkontrolovano++;
    try {
      const vysledek = await zpracujEntitu("Udalost", udalost);
      if (vysledek === "nalezeno") nalezeno++;
      if (vysledek === "smazano") smazano++;
    } catch (e) {
      chyby.push(`Událost „${udalost.nazev}“: ${(e as Error).message}`);
    }
  }

  return { zkontrolovano, nalezeno, smazano, chyby };
}

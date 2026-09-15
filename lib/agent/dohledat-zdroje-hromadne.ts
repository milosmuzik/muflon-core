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
import { dohledatZdrojeVDavce, type NalezenyZdroj } from "@/lib/agent/dohledat-zdroj";
import { smazatStavovouEntitu } from "@/lib/agent/uklid";
import { GeminiQuotaError, jeKvotaChyba } from "@/lib/agent/gemini";

export type VysledekDohledani = {
  zkontrolovano: number;
  nalezeno: number;
  smazano: number;
  preskocenoKvota: number;
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

export async function dohledatChybejiciZdroje(limitNaDavku = 5): Promise<VysledekDohledani> {
  let zkontrolovano = 0;
  let nalezeno = 0;
  let smazano = 0;
  let preskocenoKvota = 0;
  const chyby: string[] = [];

  const fronta = [
    ...(await entityBezZdroje("Pribeh", limitNaDavku)).map((e) => ({ typ: "Pribeh" as const, ...e })),
    ...(await entityBezZdroje("Udalost", limitNaDavku)).map((e) => ({ typ: "Udalost" as const, ...e })),
  ];

  if (fronta.length === 0) {
    return { zkontrolovano, nalezeno, smazano, preskocenoKvota, chyby };
  }

  // Jeden dávkový běh (interně max. 10 položek na 1 groundované volání Gemini,
  // jinak méně) místo 1 volání na entitu – viz dohledatZdrojeVDavce.
  let vysledky: Map<string, NalezenyZdroj>;
  try {
    vysledky = await dohledatZdrojeVDavce(
      fronta.map((e) => ({ klic: `${e.typ}:${e.id}`, nazev: e.nazev, obsah: e.obsah }))
    );
  } catch (e) {
    if (jeKvotaChyba(e) || e instanceof GeminiQuotaError) {
      return {
        zkontrolovano: 0,
        nalezeno: 0,
        smazano: 0,
        preskocenoKvota: fronta.length,
        chyby: ["Gemini kvóta. Dávka se ani nespustila, nic se nemazalo."],
      };
    }
    throw e;
  }

  for (const entita of fronta) {
    zkontrolovano++;
    try {
      const nalez = vysledky.get(`${entita.typ}:${entita.id}`) ?? null;
      if (!nalez) {
        if (await smazatStavovouEntitu(entita.typ, entita.id)) smazano++;
        continue;
      }

      const uroverDuvery = urovenDuveryZeZdroje(nalez.kategorie, nalez.url);
      if (urovenDuveryPriorita(uroverDuvery) < AUTOSCHVALENI_OD_UROVNE) {
        if (await smazatStavovouEntitu(entita.typ, entita.id)) smazano++;
        continue;
      }

      await prisma.zdroj.create({
        data: {
          cilovyTyp: entita.typ,
          cilovyId: entita.id,
          nazev: nazevZeZdroje(nalez.url, nalez.nazev),
          url: nalez.url,
          kategorie: nalez.kategorie,
          uroverDuvery,
          poznamka: POZNAMKA_DOHLEDANO,
        },
      });
      await zapisHistorii(entita.typ, entita.id, "upraveno", `Dohledán zdroj: ${nalez.nazev}`);
      await zvazAutomatickeSchvaleni(entita.typ, entita.id, uroverDuvery);
      nalezeno++;
    } catch (e) {
      chyby.push(`${entita.typ === "Pribeh" ? "Příběh" : "Událost"} „${entita.nazev}“: ${(e as Error).message}`);
    }
  }

  return { zkontrolovano, nalezeno, smazano, preskocenoKvota, chyby };
}

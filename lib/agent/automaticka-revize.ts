import { dohledatChybejiciZdroje } from "@/lib/agent/dohledat-zdroje-hromadne";
import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import {
  AUTOSCHVALENI_OD_UROVNE,
  urovenDuveryPriorita,
  urovenDuveryZeZdroje,
} from "@/lib/constants";

export type VysledekAutomatickeRevize = {
  schvaleno: number;
  smazanoNedostatecnyZdroj: number;
  dohledano: number;
  smazanoBezZdroje: number;
  sloucenoDuplicit: number;
  zbyva: number;
  hotovo: boolean;
  chyby: string[];
};

const CEKAJICI_STAVY = ["navrh", "overeno", "schvaleno"];
const LIMIT_ROZHODNUTI = 25;

async function idSWhitelistem(typ: "Pribeh" | "Udalost"): Promise<Set<string>> {
  const zdroje = await prisma.zdroj.findMany({
    where: { cilovyTyp: typ },
    select: { cilovyId: true, kategorie: true, url: true },
  });
  const vysledek = new Set<string>();
  for (const z of zdroje) {
    if (urovenDuveryPriorita(urovenDuveryZeZdroje(z.kategorie, z.url)) >= AUTOSCHVALENI_OD_UROVNE) {
      vysledek.add(z.cilovyId);
    }
  }
  return vysledek;
}

export async function pocetCekajicichNaWhitelist(): Promise<number> {
  const [pribehy, udalosti, pribehyWhitelist, udalostiWhitelist] = await Promise.all([
    prisma.pribeh.findMany({ where: { stav: { in: CEKAJICI_STAVY } }, select: { id: true } }),
    prisma.udalost.findMany({ where: { stav: { in: CEKAJICI_STAVY } }, select: { id: true } }),
    idSWhitelistem("Pribeh"),
    idSWhitelistem("Udalost"),
  ]);
  return (
    pribehy.filter((p) => !pribehyWhitelist.has(p.id)).length +
    udalosti.filter((u) => !udalostiWhitelist.has(u.id)).length
  );
}

async function smazatDavku(typ: "Pribeh" | "Udalost", ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  await prisma.zdroj.deleteMany({ where: { cilovyTyp: typ, cilovyId: { in: ids } } });
  await prisma.vazba.deleteMany({
    where: {
      OR: [
        { zdrojovyTyp: typ, zdrojovyId: { in: ids } },
        { cilovyTyp: typ, cilovyId: { in: ids } },
      ],
    },
  });
  await prisma.historieZmeny.deleteMany({ where: { entitaTyp: typ, entitaId: { in: ids } } });
  if (typ === "Udalost") {
    await prisma.publikace.deleteMany({ where: { udalostId: { in: ids } } });
    const vysledek = await prisma.udalost.deleteMany({ where: { id: { in: ids } } });
    return vysledek.count;
  }
  const vysledek = await prisma.pribeh.deleteMany({ where: { id: { in: ids } } });
  return vysledek.count;
}

async function rozhodniPodleExistujicichZdroju(): Promise<{
  schvaleno: number;
  smazanoNedostatecnyZdroj: number;
  jesteRozhodovat: boolean;
}> {
  let schvaleno = 0;
  let smazanoNedostatecnyZdroj = 0;
  let zpracovano = 0;

  for (const typ of ["Pribeh", "Udalost"] as const) {
    if (zpracovano >= LIMIT_ROZHODNUTI) break;

    const zaznamy =
      typ === "Pribeh"
        ? await prisma.pribeh.findMany({
            where: { stav: { in: CEKAJICI_STAVY } },
            select: { id: true, stav: true },
            take: LIMIT_ROZHODNUTI,
          })
        : await prisma.udalost.findMany({
            where: { stav: { in: CEKAJICI_STAVY } },
            select: { id: true, stav: true },
            take: LIMIT_ROZHODNUTI,
          });

    const zdroje = await prisma.zdroj.findMany({
      where: { cilovyTyp: typ, cilovyId: { in: zaznamy.map((z) => z.id) } },
      select: { cilovyId: true, kategorie: true, url: true },
    });
    const podleId = new Map<string, typeof zdroje>();
    for (const z of zdroje) {
      const seznam = podleId.get(z.cilovyId) ?? [];
      seznam.push(z);
      podleId.set(z.cilovyId, seznam);
    }

    const keSmazani: string[] = [];
    for (const zaznam of zaznamy) {
      if (zpracovano >= LIMIT_ROZHODNUTI) break;
      const zdrojeZaznamu = podleId.get(zaznam.id) ?? [];
      if (zdrojeZaznamu.length === 0) continue;
      zpracovano++;

      const nejvyssi = zdrojeZaznamu.reduce(
        (max, z) => Math.max(max, urovenDuveryPriorita(urovenDuveryZeZdroje(z.kategorie, z.url))),
        0
      );

      if (nejvyssi >= AUTOSCHVALENI_OD_UROVNE) {
        if (zaznam.stav !== "schvaleno") {
          if (typ === "Pribeh") {
            await prisma.pribeh.update({ where: { id: zaznam.id }, data: { stav: "schvaleno" } });
          } else {
            await prisma.udalost.update({ where: { id: zaznam.id }, data: { stav: "schvaleno" } });
          }
          await zapisHistorii(typ, zaznam.id, "zmena_stavu", `${zaznam.stav} → schvaleno (whitelist)`);
          schvaleno++;
        }
      } else {
        keSmazani.push(zaznam.id);
      }
    }
    smazanoNedostatecnyZdroj += await smazatDavku(typ, keSmazani);
  }

  return { schvaleno, smazanoNedostatecnyZdroj, jesteRozhodovat: zpracovano >= LIMIT_ROZHODNUTI };
}

export async function spustitAutomatickouRevizi(): Promise<VysledekAutomatickeRevize> {
  const existujici = await rozhodniPodleExistujicichZdroju();

  let dohledano = 0;
  let smazanoBezZdroje = 0;
  const chyby: string[] = [];

  if (!existujici.jesteRozhodovat) {
    const dohledani = await dohledatChybejiciZdroje(2);
    dohledano = dohledani.nalezeno;
    smazanoBezZdroje = dohledani.smazano;
    chyby.push(...dohledani.chyby);
  }

  const zbyva = await pocetCekajicichNaWhitelist();

  return {
    schvaleno: existujici.schvaleno,
    smazanoNedostatecnyZdroj: existujici.smazanoNedostatecnyZdroj,
    dohledano,
    smazanoBezZdroje,
    sloucenoDuplicit: 0,
    zbyva,
    hotovo: zbyva === 0,
    chyby,
  };
}

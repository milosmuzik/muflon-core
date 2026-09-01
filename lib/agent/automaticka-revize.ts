import { dohledatChybejiciZdroje } from "@/lib/agent/dohledat-zdroje-hromadne";
import { slouciDuplicitniUdalosti } from "@/lib/agent/duplicity";
import { smazatStavovouEntitu } from "@/lib/agent/uklid";
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

async function idSWhitelistem(typ: "Pribeh" | "Udalost"): Promise<Set<string>> {
  const zdroje = await prisma.zdroj.findMany({
    where: { cilovyTyp: typ },
    select: { cilovyId: true, kategorie: true, url: true },
  });
  const vysledek = new Set<string>();
  for (const z of zdroje) {
    const uroven = urovenDuveryZeZdroje(z.kategorie, z.url);
    if (urovenDuveryPriorita(uroven) >= AUTOSCHVALENI_OD_UROVNE) vysledek.add(z.cilovyId);
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

async function rozhodniPodleExistujicichZdroju(): Promise<{
  schvaleno: number;
  smazanoNedostatecnyZdroj: number;
}> {
  let schvaleno = 0;
  let smazanoNedostatecnyZdroj = 0;

  for (const typ of ["Pribeh", "Udalost"] as const) {
    const zaznamy =
      typ === "Pribeh"
        ? await prisma.pribeh.findMany({ where: { stav: { in: CEKAJICI_STAVY } }, select: { id: true, stav: true } })
        : await prisma.udalost.findMany({ where: { stav: { in: CEKAJICI_STAVY } }, select: { id: true, stav: true } });

    const zdroje = await prisma.zdroj.findMany({
      where: { cilovyTyp: typ, cilovyId: { in: zaznamy.map((z) => z.id) } },
    });
    const podleId = new Map<string, typeof zdroje>();
    for (const z of zdroje) {
      const seznam = podleId.get(z.cilovyId) ?? [];
      seznam.push(z);
      podleId.set(z.cilovyId, seznam);
    }

    for (const zaznam of zaznamy) {
      const zdrojeZaznamu = podleId.get(zaznam.id) ?? [];
      if (zdrojeZaznamu.length === 0) continue;

      let nejvyssi = 0;
      for (const zdroj of zdrojeZaznamu) {
        const uroven = urovenDuveryZeZdroje(zdroj.kategorie, zdroj.url);
        if (uroven !== zdroj.uroverDuvery) {
          await prisma.zdroj.update({ where: { id: zdroj.id }, data: { uroverDuvery: uroven } });
        }
        nejvyssi = Math.max(nejvyssi, urovenDuveryPriorita(uroven));
      }

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
      } else if (await smazatStavovouEntitu(typ, zaznam.id)) {
        smazanoNedostatecnyZdroj++;
      }
    }
  }

  return { schvaleno, smazanoNedostatecnyZdroj };
}

export async function spustitAutomatickouRevizi(): Promise<VysledekAutomatickeRevize> {
  const existujici = await rozhodniPodleExistujicichZdroju();
  const dohledani = await dohledatChybejiciZdroje(8);
  const slouceni = await slouciDuplicitniUdalosti();
  const zbyva = await pocetCekajicichNaWhitelist();

  return {
    schvaleno: existujici.schvaleno,
    smazanoNedostatecnyZdroj: existujici.smazanoNedostatecnyZdroj,
    dohledano: dohledani.nalezeno,
    smazanoBezZdroje: dohledani.smazano,
    sloucenoDuplicit: slouceni.smazanoDuplicit,
    zbyva,
    hotovo: zbyva === 0,
    chyby: dohledani.chyby,
  };
}

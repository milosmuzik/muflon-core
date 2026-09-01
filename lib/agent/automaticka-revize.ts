import { dohledatChybejiciZdroje } from "@/lib/agent/dohledat-zdroje-hromadne";
import { revidovatVse } from "@/lib/agent/revize-vse";
import { smazatNekvalifikovane } from "@/lib/agent/uklid";
import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";

export type VysledekAutomatickeRevize = {
  vracenoNaNavrh: number;
  dohledano: number;
  smazanoBezZdroje: number;
  revidovanoZdroju: number;
  schvaleno: number;
  smazanoPoRevizi: number;
  chyby: string[];
};

async function vratitSchvaleneBezZdrojeNaNavrh(): Promise<number> {
  let vraceno = 0;

  const pribehy = await prisma.pribeh.findMany({ where: { stav: { not: "navrh" } } });
  for (const pribeh of pribehy) {
    const pocetZdroju = await prisma.zdroj.count({ where: { cilovyTyp: "Pribeh", cilovyId: pribeh.id } });
    if (pocetZdroju === 0) {
      await prisma.pribeh.update({ where: { id: pribeh.id }, data: { stav: "navrh" } });
      await zapisHistorii("Pribeh", pribeh.id, "zmena_stavu", `${pribeh.stav} → navrh (automatická revize – bez zdroje)`);
      vraceno++;
    }
  }

  const udalosti = await prisma.udalost.findMany({ where: { stav: { not: "navrh" } } });
  for (const udalost of udalosti) {
    const pocetZdroju = await prisma.zdroj.count({ where: { cilovyTyp: "Udalost", cilovyId: udalost.id } });
    if (pocetZdroju === 0) {
      await prisma.udalost.update({ where: { id: udalost.id }, data: { stav: "navrh" } });
      await zapisHistorii("Udalost", udalost.id, "zmena_stavu", `${udalost.stav} → navrh (automatická revize – bez zdroje)`);
      vraceno++;
    }
  }

  return vraceno;
}

export async function spustitAutomatickouRevizi(): Promise<VysledekAutomatickeRevize> {
  const vracenoNaNavrh = await vratitSchvaleneBezZdrojeNaNavrh();
  const dohledani = await dohledatChybejiciZdroje(6);

  let revidovanoZdroju = 0;
  let schvaleno = 0;
  let kurzor: string | null = null;
  for (let i = 0; i < 4; i++) {
    const davka = await revidovatVse(kurzor, 20);
    revidovanoZdroju += davka.opravenoZdroju;
    schvaleno += davka.schvalenoNove;
    kurzor = davka.posledniId;
    if (davka.hotovo) break;
  }

  const uklid = await smazatNekvalifikovane();

  return {
    vracenoNaNavrh,
    dohledano: dohledani.nalezeno,
    smazanoBezZdroje: dohledani.smazano,
    revidovanoZdroju,
    schvaleno,
    smazanoPoRevizi: uklid.smazanoUdalosti + uklid.smazanoPribehu,
    chyby: dohledani.chyby,
  };
}

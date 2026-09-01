import { prisma } from "@/lib/prisma";
import {
  AUTOSCHVALENI_OD_UROVNE,
  POZNAMKA_AI_NAVRH_KALENDAR,
  POZNAMKA_AI_ROZSIRENI,
  POZNAMKA_DOHLEDANO,
  urovenDuveryPriorita,
} from "@/lib/constants";

const AI_POZNAMKY = [POZNAMKA_AI_NAVRH_KALENDAR, POZNAMKA_AI_ROZSIRENI, POZNAMKA_DOHLEDANO];

const AI_POZNAMKY_VCETNE_REVIDOVANYCH = AI_POZNAMKY.map((p) => ({ poznamka: { startsWith: p } }));

export type VysledekUklidu = {
  zkontrolovano: number;
  smazanoUdalosti: number;
  smazanoPribehu: number;
};

const SMAZATELNE_STAVY = new Set(["navrh", "overeno", "schvaleno"]);

export async function smazatStavovouEntitu(typ: string, id: string): Promise<boolean> {
  const zaznam =
    typ === "Udalost"
      ? await prisma.udalost.findUnique({ where: { id }, select: { stav: true } })
      : typ === "Pribeh"
        ? await prisma.pribeh.findUnique({ where: { id }, select: { stav: true } })
        : null;
  if (!zaznam) return false;
  if (!SMAZATELNE_STAVY.has(zaznam.stav)) return false;

  await prisma.zdroj.deleteMany({ where: { cilovyTyp: typ, cilovyId: id } });
  await prisma.vazba.deleteMany({
    where: { OR: [{ zdrojovyTyp: typ, zdrojovyId: id }, { cilovyTyp: typ, cilovyId: id }] },
  });
  await prisma.historieZmeny.deleteMany({ where: { entitaTyp: typ, entitaId: id } });

  if (typ === "Udalost") {
    await prisma.publikace.deleteMany({ where: { udalostId: id } });
    await prisma.udalost.delete({ where: { id } });
  } else {
    await prisma.pribeh.delete({ where: { id } });
  }
  return true;
}

export async function smazatNekvalifikovane(): Promise<VysledekUklidu> {
  const dotcene = await prisma.zdroj.findMany({
    where: { cilovyTyp: { in: ["Udalost", "Pribeh"] }, OR: AI_POZNAMKY_VCETNE_REVIDOVANYCH },
    select: { cilovyTyp: true, cilovyId: true },
  });

  const entity = new Map<string, { typ: string; id: string }>();
  for (const z of dotcene) entity.set(`${z.cilovyTyp}:${z.cilovyId}`, { typ: z.cilovyTyp, id: z.cilovyId });

  let smazanoUdalosti = 0;
  let smazanoPribehu = 0;

  for (const { typ, id } of entity.values()) {
    const zdroje = await prisma.zdroj.findMany({ where: { cilovyTyp: typ, cilovyId: id }, select: { uroverDuvery: true } });
    const nejvyssiUroven = zdroje.reduce((max, z) => Math.max(max, urovenDuveryPriorita(z.uroverDuvery)), 0);
    if (nejvyssiUroven >= AUTOSCHVALENI_OD_UROVNE) continue;

    const smazano = await smazatStavovouEntitu(typ, id);
    if (!smazano) continue;
    if (typ === "Udalost") smazanoUdalosti++;
    else smazanoPribehu++;
  }

  return { zkontrolovano: entity.size, smazanoUdalosti, smazanoPribehu };
}

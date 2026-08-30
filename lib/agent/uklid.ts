import { prisma } from "@/lib/prisma";
import {
  AUTOSCHVALENI_OD_UROVNE,
  POZNAMKA_AI_NAVRH_KALENDAR,
  POZNAMKA_AI_ROZSIRENI,
  POZNAMKA_DOHLEDANO,
  urovenDuveryPriorita,
} from "@/lib/constants";

const AI_POZNAMKY = [POZNAMKA_AI_NAVRH_KALENDAR, POZNAMKA_AI_ROZSIRENI, POZNAMKA_DOHLEDANO];

export type VysledekUklidu = {
  zkontrolovano: number;
  smazanoUdalosti: number;
  smazanoPribehu: number;
};

// Jednorázový úklid: příběhy a události, které dostaly zdroj od AI agenta,
// prošly kompletní revizí (viz revize-vse.ts - Google redirect rozbalen,
// whitelist médií rozšířený), a i tak zůstaly bez dostatečně důvěryhodného
// zdroje ve stavu návrh/ověřeno. Nikdo je ručně nereviduje, takže dál jen
// zabírají místo v databázi bez šance na schválení - smažou se úplně
// (zdroje, vazby, historie, u událostí i publikace), ne jen archivují.
export async function smazatNekvalifikovane(): Promise<VysledekUklidu> {
  const dotcene = await prisma.zdroj.findMany({
    where: { cilovyTyp: { in: ["Udalost", "Pribeh"] }, poznamka: { in: AI_POZNAMKY } },
    select: { cilovyTyp: true, cilovyId: true },
  });

  const entity = new Map<string, { typ: string; id: string }>();
  for (const z of dotcene) entity.set(`${z.cilovyTyp}:${z.cilovyId}`, { typ: z.cilovyTyp, id: z.cilovyId });

  let smazanoUdalosti = 0;
  let smazanoPribehu = 0;

  for (const { typ, id } of entity.values()) {
    const zaznam =
      typ === "Udalost"
        ? await prisma.udalost.findUnique({ where: { id }, select: { stav: true } })
        : await prisma.pribeh.findUnique({ where: { id }, select: { stav: true } });
    if (!zaznam || (zaznam.stav !== "navrh" && zaznam.stav !== "overeno")) continue;

    const zdroje = await prisma.zdroj.findMany({ where: { cilovyTyp: typ, cilovyId: id }, select: { uroverDuvery: true } });
    const nejvyssiUroven = zdroje.reduce((max, z) => Math.max(max, urovenDuveryPriorita(z.uroverDuvery)), 0);
    if (nejvyssiUroven >= AUTOSCHVALENI_OD_UROVNE) continue;

    await prisma.zdroj.deleteMany({ where: { cilovyTyp: typ, cilovyId: id } });
    await prisma.vazba.deleteMany({
      where: { OR: [{ zdrojovyTyp: typ, zdrojovyId: id }, { cilovyTyp: typ, cilovyId: id }] },
    });
    await prisma.historieZmeny.deleteMany({ where: { entitaTyp: typ, entitaId: id } });

    if (typ === "Udalost") {
      await prisma.publikace.deleteMany({ where: { udalostId: id } });
      await prisma.udalost.delete({ where: { id } });
      smazanoUdalosti++;
    } else {
      await prisma.pribeh.delete({ where: { id } });
      smazanoPribehu++;
    }
  }

  return { zkontrolovano: entity.size, smazanoUdalosti, smazanoPribehu };
}

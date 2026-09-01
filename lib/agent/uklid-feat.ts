import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { sloucitDvojici } from "@/lib/actions/slouceni";
import { obsahujeFeat, rozdelFeat } from "@/lib/agent/feat";

export type VysledekUkliduFeat = {
  opravenoInterpretu: number;
  napojenoHostu: number;
  slouceno: number;
  zbyva: number;
  hotovo: boolean;
  chyby: string[];
};

const LIMIT = 15;

async function najdiNeboVytvorInterpret(nazev: string): Promise<string> {
  const existujici = await prisma.interpret.findFirst({
    where: { nazev: { equals: nazev, mode: "insensitive" } },
    select: { id: true },
  });
  if (existujici) return existujici.id;
  const novy = await prisma.interpret.create({
    data: { nazev, typ: "projekt", stav: "aktivni", poznamka: "Doplněno z feat/ft v playlistu" },
  });
  await zapisHistorii("Interpret", novy.id, "vytvoreno", `Založeno z feat: ${nazev}`);
  return novy.id;
}

async function pripojKeSkladbě(skladbaId: string, interpretId: string) {
  const existuje = await prisma.skladbaInterpret.findFirst({
    where: { skladbaId, interpretId },
  });
  if (existuje) return false;
  await prisma.skladbaInterpret.create({ data: { skladbaId, interpretId } });
  return true;
}

function pridejAlternativni(stavajici: string | null, pridat: string): string {
  let seznam: string[] = [];
  if (stavajici) {
    try {
      const pars = JSON.parse(stavajici);
      if (Array.isArray(pars)) seznam = pars.map(String);
    } catch {
      seznam = [stavajici];
    }
  }
  if (!seznam.some((n) => n.toLowerCase() === pridat.toLowerCase())) seznam.push(pridat);
  return JSON.stringify(seznam);
}

export async function pocetFeatKOprave(): Promise<number> {
  const [interpreti, skladby] = await Promise.all([
    prisma.interpret.findMany({ select: { nazev: true } }),
    prisma.skladba.findMany({ select: { nazev: true } }),
  ]);
  return (
    interpreti.filter((i) => obsahujeFeat(i.nazev)).length +
    skladby.filter((s) => obsahujeFeat(s.nazev)).length
  );
}

export async function opravitFeatDavku(): Promise<VysledekUkliduFeat> {
  let opravenoInterpretu = 0;
  let napojenoHostu = 0;
  let slouceno = 0;
  const chyby: string[] = [];

  const interpreti = await prisma.interpret.findMany({
    select: { id: true, nazev: true, alternativniNazvy: true },
  });
  const featInterpreti = interpreti.filter((i) => obsahujeFeat(i.nazev)).slice(0, LIMIT);

  for (const interpret of featInterpreti) {
    const casti = rozdelFeat(interpret.nazev);
    if (!casti) continue;
    try {
      const primarniId = await najdiNeboVytvorInterpret(casti.primarni);
      const hostIds: string[] = [];
      for (const host of casti.hoste) {
        hostIds.push(await najdiNeboVytvorInterpret(host));
      }

      const vazby = await prisma.skladbaInterpret.findMany({
        where: { interpretId: interpret.id },
        select: { skladbaId: true },
      });
      for (const vazba of vazby) {
        if (await pripojKeSkladbě(vazba.skladbaId, primarniId)) napojenoHostu++;
        for (const hostId of hostIds) {
          if (await pripojKeSkladbě(vazba.skladbaId, hostId)) napojenoHostu++;
        }
      }

      if (primarniId !== interpret.id) {
        await sloucitDvojici(primarniId, interpret.id);
        slouceno++;
      } else {
        await prisma.interpret.update({
          where: { id: interpret.id },
          data: {
            nazev: casti.primarni,
            alternativniNazvy: pridejAlternativni(interpret.alternativniNazvy, interpret.nazev),
          },
        });
        await zapisHistorii(
          "Interpret",
          interpret.id,
          "upraveno",
          `„${interpret.nazev}“ → „${casti.primarni}“ (feat oddělen)`
        );
      }
      opravenoInterpretu++;
    } catch (e) {
      chyby.push(`Interpret „${interpret.nazev}“: ${(e as Error).message}`);
    }
  }

  if (featInterpreti.length < LIMIT) {
    const skladby = await prisma.skladba.findMany({
      select: { id: true, nazev: true },
    });
    const featSkladby = skladby.filter((s) => obsahujeFeat(s.nazev)).slice(0, LIMIT);
    for (const skladba of featSkladby) {
      const casti = rozdelFeat(skladba.nazev);
      if (!casti) continue;
      try {
        for (const host of casti.hoste) {
          const hostId = await najdiNeboVytvorInterpret(host);
          if (await pripojKeSkladbě(skladba.id, hostId)) napojenoHostu++;
        }
      } catch (e) {
        chyby.push(`Skladba „${skladba.nazev}“: ${(e as Error).message}`);
      }
    }
  }

  const zbyva = await pocetFeatKOprave();
  return { opravenoInterpretu, napojenoHostu, slouceno, zbyva, hotovo: zbyva === 0, chyby };
}

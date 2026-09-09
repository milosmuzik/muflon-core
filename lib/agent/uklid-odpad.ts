import { prisma } from "@/lib/prisma";

const PRESNE = new Set([
  "Rádio Muflon",
  "__SCHEMA_PROBE__",
  "__TEST_ZKOUSKA__",
  "feat. Devour The Day",
  "www.sapho.cz",
]);

export function jeOdpadovyNazev(nazev: string): boolean {
  const n = nazev.trim();
  if (PRESNE.has(n)) return true;
  if (n.startsWith("__") && n.endsWith("__")) return true;
  if (/^www\./i.test(n)) return true;
  if (/^feat\./i.test(n)) return true;
  return false;
}

export type VysledekUkliduOdpadu = { nalezeno: number; smazano: number; nazvy: string[] };

export async function smazatOdpadoveInterprety(): Promise<VysledekUkliduOdpadu> {
  const kandidati = await prisma.interpret.findMany({
    select: { id: true, nazev: true },
  });
  const odpad = kandidati.filter((i) => jeOdpadovyNazev(i.nazev));
  const nazvy: string[] = [];

  for (const i of odpad) {
    await prisma.clenstvi.deleteMany({ where: { interpretId: i.id } });
    await prisma.albumInterpret.deleteMany({ where: { interpretId: i.id } });
    await prisma.skladbaInterpret.deleteMany({ where: { interpretId: i.id } });
    await prisma.zdroj.deleteMany({ where: { cilovyTyp: "Interpret", cilovyId: i.id } });
    await prisma.vazba.deleteMany({
      where: {
        OR: [
          { zdrojovyTyp: "Interpret", zdrojovyId: i.id },
          { cilovyTyp: "Interpret", cilovyId: i.id },
        ],
      },
    });
    await prisma.historieZmeny.deleteMany({ where: { entitaTyp: "Interpret", entitaId: i.id } });
    await prisma.interpret.delete({ where: { id: i.id } });
    nazvy.push(i.nazev);
  }

  return { nalezeno: odpad.length, smazano: nazvy.length, nazvy };
}

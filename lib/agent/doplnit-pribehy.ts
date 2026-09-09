import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { geminiJeDostupne, jeKvotaChyba, zavolejGemini } from "@/lib/agent/gemini";

export type VysledekPribehu = {
  zeSablony: number;
  zGemini: number;
  preskoceno: number;
  zbyva: number;
  chyby: string[];
};

async function maPribeh(interpretId: string): Promise<boolean> {
  const vazba = await prisma.vazba.findFirst({
    where: { zdrojovyTyp: "Pribeh", cilovyTyp: "Interpret", cilovyId: interpretId },
  });
  return Boolean(vazba);
}

async function ulozPribeh(interpretId: string, nazev: string, nadpis: string, obsah: string, stav: string) {
  const p = await prisma.pribeh.create({
    data: { nadpis, obsah, stav },
  });
  await prisma.vazba.create({
    data: {
      zdrojovyTyp: "Pribeh",
      zdrojovyId: p.id,
      cilovyTyp: "Interpret",
      cilovyId: interpretId,
      typVztahu: "o_interpretovi",
    },
  });
  await zapisHistorii("Pribeh", p.id, "vytvoreno", `Příběh pro ${nazev}`);
}

export async function doplnitChybejiciPribehy(limit = 10): Promise<VysledekPribehu> {
  const chyby: string[] = [];
  let zeSablony = 0;
  let zGemini = 0;
  let preskoceno = 0;

  const vPlaylistu = await prisma.skladbaInterpret.findMany({
    where: { skladba: { vPlaylistu: true } },
    select: { interpretId: true },
    distinct: ["interpretId"],
  });
  const ids = vPlaylistu.map((x) => x.interpretId);

  const interpreti = await prisma.interpret.findMany({
    where: { id: { in: ids } },
    orderBy: { nazev: "asc" },
    select: { id: true, nazev: true, historie: true, zeme: true, rokVzniku: true },
  });

  const bez: typeof interpreti = [];
  for (const i of interpreti) {
    if (await maPribeh(i.id)) continue;
    bez.push(i);
  }

  const davka = bez.slice(0, limit);
  for (const i of davka) {
    const historie = i.historie?.trim() ?? "";
    if (historie.length >= 80) {
      try {
        await ulozPribeh(i.id, i.nazev, i.nazev, historie.slice(0, 4000), "schvaleno");
        zeSablony++;
      } catch (e) {
        chyby.push(`${i.nazev}: ${(e as Error).message}`);
      }
      continue;
    }

    if (!geminiJeDostupne()) {
      preskoceno++;
      continue;
    }

    const fakta = [i.nazev, i.zeme, i.rokVzniku ? `vznik ${i.rokVzniku}` : "", historie]
      .filter(Boolean)
      .join(", ");
    try {
      const text = await zavolejGemini(
        `Napiš česky 2 krátké věty o kapele pro rádio (rock/metal). Jen ověřená fakta z tohoto vstupu, nic si nevymýšlej. Bez úvodu, bez markdownu.\n\n${fakta}`,
        false,
      );
      const obsah = text.replace(/^"|"$/g, "").trim();
      if (obsah.length < 40) {
        preskoceno++;
        continue;
      }
      await ulozPribeh(i.id, i.nazev, i.nazev, obsah.slice(0, 800), "navrh");
      zGemini++;
    } catch (e) {
      chyby.push(`${i.nazev}: ${(e as Error).message}`);
      if (jeKvotaChyba(e)) break;
    }
  }

  return {
    zeSablony,
    zGemini,
    preskoceno,
    zbyva: Math.max(0, bez.length - davka.length),
    chyby: chyby.slice(-8),
  };
}

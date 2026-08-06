// lib/import-karta.ts
//
// Sdílená importní logika pro Referenční karty (MS-2.0). Používá ji jak
// CLI skript (prisma/import-batch.ts) tak API endpoint
// (app/api/admin/import-karty/route.ts), aby existovala jen jedna verze
// pravdy pro to, jak se karta zapisuje do DB.

import { PrismaClient } from "@prisma/client";

export type Clen = {
  jmeno: string;
  role?: string | null;
  nastroj?: string | null;
  obdobiOd?: string | null;
  obdobiDo?: string | null;
  poznamka?: string | null;
};

export type Album = { nazev: string; rok?: string | null };

export type Skladba = { nazev: string; album?: string | null };

export type Udalost = {
  nazev: string;
  datum: string;
  typ?: string;
  popis?: string | null;
};

export type Pribeh = { nadpis: string; obsah: string };

export type Zdroj = {
  nazev: string;
  url?: string | null;
  kategorie: string;
  uroverDuvery?: string;
};

export type Karta = {
  nazev: string;
  rokVzniku?: number | null;
  zeme?: string | null;
  mesto?: string | null;
  zanry?: string | null;
  historie?: string | null;
  redakcniVyznam?: string | null;
  referencniId?: string | null;
  urovenKarty?: string;
  clenove?: Clen[];
  alba?: Album[];
  skladby?: Skladba[];
  udalosti?: Udalost[];
  pribehy?: Pribeh[];
  zdroje?: Zdroj[];
};

export type VysledekImportu = {
  nazev: string;
  interpretId: string;
  pocty: {
    clenove: number;
    alba: number;
    skladby: number;
    udalosti: number;
    pribehy: number;
    zdroje: number;
  };
};

async function najdiNeboZaloz(prisma: PrismaClient, nazev: string) {
  let i = await prisma.interpret.findFirst({ where: { nazev } });
  if (!i) i = await prisma.interpret.create({ data: { nazev } });
  return i;
}

export async function importujKartu(
  prisma: PrismaClient,
  k: Karta
): Promise<VysledekImportu> {
  const interpret = await najdiNeboZaloz(prisma, k.nazev);

  await prisma.interpret.update({
    where: { id: interpret.id },
    data: {
      rokVzniku: k.rokVzniku ?? undefined,
      zeme: k.zeme ?? undefined,
      mesto: k.mesto ?? undefined,
      zanry: k.zanry ?? undefined,
      historie: k.historie ?? undefined,
      redakcniVyznam: k.redakcniVyznam ?? undefined,
      referencniId: k.referencniId ?? undefined,
      urovenKarty: k.urovenKarty ?? "referencni",
    },
  });

  let pocetClenu = 0;
  for (const c of k.clenove ?? []) {
    let h = await prisma.hudebnik.findFirst({ where: { jmeno: c.jmeno } });
    if (!h) h = await prisma.hudebnik.create({ data: { jmeno: c.jmeno } });
    const existuje = await prisma.clenstvi.findFirst({
      where: { hudebnikId: h.id, interpretId: interpret.id, obdobiOd: c.obdobiOd ?? undefined },
    });
    if (!existuje) {
      await prisma.clenstvi.create({
        data: {
          hudebnikId: h.id,
          interpretId: interpret.id,
          role: c.role ?? null,
          nastroj: c.nastroj ?? null,
          obdobiOd: c.obdobiOd ?? null,
          obdobiDo: c.obdobiDo ?? null,
          poznamka: c.poznamka ?? null,
        },
      });
      pocetClenu++;
    }
  }

  const albaId: Record<string, string> = {};
  let pocetAlb = 0;
  for (const a of k.alba ?? []) {
    let album = await prisma.album.findFirst({ where: { nazev: a.nazev } });
    if (!album) {
      album = await prisma.album.create({ data: { nazev: a.nazev, datumVydani: a.rok ?? null } });
      await prisma.albumInterpret.create({ data: { albumId: album.id, interpretId: interpret.id } });
      pocetAlb++;
    }
    albaId[a.nazev] = album.id;
  }

  let pocetSkladeb = 0;
  for (const s of k.skladby ?? []) {
    let skladba = await prisma.skladba.findFirst({
      where: { nazev: s.nazev, interpreti: { some: { interpretId: interpret.id } } },
    });
    if (!skladba) {
      skladba = await prisma.skladba.create({
        data: {
          nazev: s.nazev,
          vPlaylistu: true,
          albumId: s.album ? albaId[s.album] ?? null : null,
        },
      });
      await prisma.skladbaInterpret.create({ data: { skladbaId: skladba.id, interpretId: interpret.id } });
      pocetSkladeb++;
    }
  }

  let pocetUdalosti = 0;
  for (const u of k.udalosti ?? []) {
    const existuje = await prisma.udalost.findFirst({ where: { nazev: u.nazev } });
    if (!existuje) {
      const novaUdalost = await prisma.udalost.create({
        data: {
          nazev: u.nazev,
          datum: u.datum,
          typ: u.typ ?? "jina",
          opakujeSe: true,
          popis: u.popis ?? null,
          stav: "overeno",
        },
      });
      await prisma.vazba.create({
        data: {
          zdrojovyTyp: "Udalost",
          zdrojovyId: novaUdalost.id,
          cilovyTyp: "Interpret",
          cilovyId: interpret.id,
          typVztahu: "tyka_se",
        },
      });
      pocetUdalosti++;
    }
  }

  let pocetPribehu = 0;
  for (const p of k.pribehy ?? []) {
    const existuje = await prisma.pribeh.findFirst({ where: { nadpis: p.nadpis } });
    if (!existuje) {
      const novyPribeh = await prisma.pribeh.create({ data: { nadpis: p.nadpis, obsah: p.obsah, stav: "overeno" } });
      await prisma.vazba.create({
        data: {
          zdrojovyTyp: "Pribeh",
          zdrojovyId: novyPribeh.id,
          cilovyTyp: "Interpret",
          cilovyId: interpret.id,
          typVztahu: "vypráví o",
        },
      });
      pocetPribehu++;
    }
  }

  let pocetZdroju = 0;
  for (const z of k.zdroje ?? []) {
    const existuje = await prisma.zdroj.findFirst({
      where: { cilovyTyp: "Interpret", cilovyId: interpret.id, url: z.url ?? undefined, nazev: z.nazev },
    });
    if (!existuje) {
      await prisma.zdroj.create({
        data: {
          cilovyTyp: "Interpret",
          cilovyId: interpret.id,
          nazev: z.nazev,
          url: z.url ?? null,
          kategorie: z.kategorie,
          uroverDuvery: z.uroverDuvery ?? "vysoka",
        },
      });
      pocetZdroju++;
    }
  }

  return {
    nazev: k.nazev,
    interpretId: interpret.id,
    pocty: {
      clenove: pocetClenu,
      alba: pocetAlb,
      skladby: pocetSkladeb,
      udalosti: pocetUdalosti,
      pribehy: pocetPribehu,
      zdroje: pocetZdroju,
    },
  };
}

import { prisma } from "@/lib/prisma";

export type RadekBezZdroje = {
  typ: string;
  label: string;
  id: string;
  nazev: string;
  href: string;
};

const CESTY: Record<string, (id: string) => string> = {
  Interpret: (id) => `/interpreti/${id}`,
  Hudebnik: (id) => `/hudebnici/${id}`,
  Album: (id) => `/alba/${id}`,
  Skladba: (id) => `/skladby/${id}`,
  Pribeh: (id) => `/pribehy/${id}`,
  Udalost: (id) => `/udalosti/${id}`,
};

const LABELY: Record<string, string> = {
  Interpret: "Interpret",
  Hudebnik: "Hudebník",
  Album: "Album",
  Skladba: "Skladba",
  Pribeh: "Příběh",
  Udalost: "Událost",
};

function zdedenoPres<T extends { interpretId: string }>(
  vazby: T[],
  ziskejId: (v: T) => string,
  interpretiSeZdrojem: Set<string>
): Set<string> {
  const set = new Set<string>();
  for (const v of vazby) {
    if (interpretiSeZdrojem.has(v.interpretId)) set.add(ziskejId(v));
  }
  return set;
}

export async function prehledBezZdroje(limitNaTyp = 6): Promise<{
  pocty: Record<string, number>;
  vzorek: RadekBezZdroje[];
}> {
  const [
    zdroje,
    clenstvi,
    albumInterpret,
    skladbaInterpret,
    interpreti,
    hudebnici,
    alba,
    skladby,
    pribehy,
    udalosti,
  ] = await Promise.all([
    prisma.zdroj.findMany({ select: { cilovyTyp: true, cilovyId: true } }),
    prisma.clenstvi.findMany({ select: { hudebnikId: true, interpretId: true } }),
    prisma.albumInterpret.findMany({ select: { albumId: true, interpretId: true } }),
    prisma.skladbaInterpret.findMany({ select: { skladbaId: true, interpretId: true } }),
    prisma.interpret.findMany({ select: { id: true, nazev: true }, orderBy: { nazev: "asc" } }),
    prisma.hudebnik.findMany({ select: { id: true, jmeno: true }, orderBy: { jmeno: "asc" } }),
    prisma.album.findMany({ select: { id: true, nazev: true }, orderBy: { nazev: "asc" } }),
    prisma.skladba.findMany({ select: { id: true, nazev: true }, orderBy: { nazev: "asc" } }),
    prisma.pribeh.findMany({ select: { id: true, nadpis: true }, orderBy: { createdAt: "desc" } }),
    prisma.udalost.findMany({ select: { id: true, nazev: true }, orderBy: { nazev: "asc" } }),
  ]);

  const maPrimo = new Set(zdroje.map((z) => `${z.cilovyTyp}:${z.cilovyId}`));

  // Interpreti, kteří mají vlastní zdroj – hudebník/album/skladba zděděné
  // přes ně se počítají jako pokryté, i když nemají vlastní řádek v Zdroj.
  const interpretiSeZdrojem = new Set(
    zdroje.filter((z) => z.cilovyTyp === "Interpret").map((z) => z.cilovyId)
  );

  const hudebnikPokryt = zdedenoPres(clenstvi, (v) => v.hudebnikId, interpretiSeZdrojem);
  const albumPokryt = zdedenoPres(albumInterpret, (v) => v.albumId, interpretiSeZdrojem);
  const skladbaPokryt = zdedenoPres(skladbaInterpret, (v) => v.skladbaId, interpretiSeZdrojem);

  function maZdroj(typ: string, id: string): boolean {
    if (maPrimo.has(`${typ}:${id}`)) return true;
    if (typ === "Hudebnik") return hudebnikPokryt.has(id);
    if (typ === "Album") return albumPokryt.has(id);
    if (typ === "Skladba") return skladbaPokryt.has(id);
    return false;
  }

  const skupiny: { typ: string; radky: { id: string; nazev: string }[] }[] = [
    { typ: "Interpret", radky: interpreti.map((x) => ({ id: x.id, nazev: x.nazev })) },
    { typ: "Hudebnik", radky: hudebnici.map((x) => ({ id: x.id, nazev: x.jmeno })) },
    { typ: "Album", radky: alba.map((x) => ({ id: x.id, nazev: x.nazev })) },
    { typ: "Skladba", radky: skladby.map((x) => ({ id: x.id, nazev: x.nazev })) },
    { typ: "Pribeh", radky: pribehy.map((x) => ({ id: x.id, nazev: x.nadpis })) },
    { typ: "Udalost", radky: udalosti.map((x) => ({ id: x.id, nazev: x.nazev })) },
  ];

  const pocty: Record<string, number> = {};
  const vzorek: RadekBezZdroje[] = [];

  for (const g of skupiny) {
    const chybi = g.radky.filter((r) => !maZdroj(g.typ, r.id));
    pocty[g.typ] = chybi.length;
    for (const r of chybi.slice(0, limitNaTyp)) {
      vzorek.push({
        typ: g.typ,
        label: LABELY[g.typ],
        id: r.id,
        nazev: r.nazev,
        href: CESTY[g.typ](r.id),
      });
    }
  }

  return { pocty, vzorek };
}

// app/api/public/kapela/route.ts
//
// Veřejný, neautentizovaný endpoint pro dotaz "co víme o téhle kapele" -
// používá ho např. web Rádia Muflon a appka muflon-stats k obohacení
// živého logu o krátký text ke hrajícímu interpretovi.
//
// Request:
// GET /api/public/kapela?jmeno=<nazev interpreta>&skladba=<nazev skladby>
//
// Response:
// { "nalezena": true, "nazev": "...",
//   "pribehy": [{ "nadpis", "obsah" }],
//   "udalosti": [{ "nazev", "datum", "popis" }],
//   "sestava": [{ "jmeno", "role", "nastroj", "obdobiOd", "obdobiDo" }],
//   "historie": "...", "kratkyPribeh": "..." }
// { "nalezena": false }
//
// Všechny textové pole nesou CELÝ text (bez zkracování) - klient si sám
// vybere, co a jak zobrazit. "sestava" (členové kapely) bývá vyplněná
// prakticky vždy; "historie" slouží jako doplněk/náhrada, když chybí
// příběhy nebo události. "kratkyPribeh" je starší, zkrácené pole
// ponechané pro zpětnou kompatibilitu.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };
const MAX_DELKA_PRIBEHU = 500;
const VEREJNE_STAVY_PRIBEHU = ["schvaleno", "publikovano"];

function zkratit(text: string, max: number): string {
  const oriznuty = text.trim();
  if (oriznuty.length <= max) return oriznuty;
  const useknuty = oriznuty.slice(0, max);
  const posledniMezera = useknuty.lastIndexOf(" ");
  const zaklad = posledniMezera > 0 ? useknuty.slice(0, posledniMezera) : useknuty;
  return `${zaklad.trim()}…`;
}

function normalizuj(text: string): string {
  return text.trim().toLowerCase();
}

async function kandidatiPodleJmena(jmeno: string) {
  const presni = await prisma.interpret.findMany({
    where: { nazev: { equals: jmeno, mode: "insensitive" } },
  });
  if (presni.length > 0) return presni;

  const sAlternativami = await prisma.interpret.findMany({
    where: { alternativniNazvy: { not: null } },
    select: { id: true, alternativniNazvy: true },
  });
  const cil = normalizuj(jmeno);
  const shody = sAlternativami.filter((i) => {
    try {
      const alt = JSON.parse(i.alternativniNazvy ?? "[]");
      return Array.isArray(alt) && alt.some((a) => normalizuj(String(a)) === cil);
    } catch {
      return false;
    }
  });
  if (shody.length > 0) {
    return prisma.interpret.findMany({ where: { id: { in: shody.map((s) => s.id) } } });
  }

  const obsahuje = await prisma.interpret.findMany({
    where: { nazev: { contains: jmeno, mode: "insensitive" } },
    take: 10,
  });
  return obsahuje;
}

async function vyberInterpreta(
  kandidati: Awaited<ReturnType<typeof kandidatiPodleJmena>>,
  skladba: string | null,
) {
  if (kandidati.length === 0) return null;
  if (kandidati.length === 1 || !skladba) return kandidati[0];

  const hledana = normalizuj(skladba);
  const sRepertoarem = await prisma.interpret.findMany({
    where: { id: { in: kandidati.map((k) => k.id) } },
    include: {
      skladby: { include: { skladba: true } },
      alba: { include: { album: true } },
    },
  });

  const podleSkladby = sRepertoarem.find((i) =>
    i.skladby.some((s) => normalizuj(s.skladba.nazev) === hledana),
  );
  if (podleSkladby) return kandidati.find((k) => k.id === podleSkladby.id) ?? podleSkladby;

  const podleAlba = sRepertoarem.find((i) =>
    i.alba.some((a) => normalizuj(a.album.nazev) === hledana),
  );
  if (podleAlba) return kandidati.find((k) => k.id === podleAlba.id) ?? podleAlba;

  const podleCasti = sRepertoarem.find(
    (i) =>
      i.skladby.some((s) => normalizuj(s.skladba.nazev).includes(hledana) || hledana.includes(normalizuj(s.skladba.nazev))) ||
      i.alba.some((a) => normalizuj(a.album.nazev).includes(hledana) || hledana.includes(normalizuj(a.album.nazev))),
  );
  if (podleCasti) return kandidati.find((k) => k.id === podleCasti.id) ?? podleCasti;

  return kandidati[0];
}

async function najdiVerejnePribehy(interpretId: string) {
  const vazby = await prisma.vazba.findMany({
    where: { zdrojovyTyp: "Pribeh", cilovyTyp: "Interpret", cilovyId: interpretId },
  });
  if (vazby.length === 0) return [];
  return prisma.pribeh.findMany({
    where: { id: { in: vazby.map((v) => v.zdrojovyId) }, stav: { in: VEREJNE_STAVY_PRIBEHU } },
    orderBy: { updatedAt: "desc" },
  });
}

async function najdiVerejneUdalosti(nazevInterpreta: string) {
  return prisma.udalost.findMany({
    where: { nazev: { contains: nazevInterpreta, mode: "insensitive" }, stav: { in: VEREJNE_STAVY_PRIBEHU } },
    orderBy: { datum: "asc" },
  });
}

async function najdiSestavu(interpretId: string) {
  const clenstvi = await prisma.clenstvi.findMany({
    where: { interpretId },
    include: { hudebnik: true },
    orderBy: { createdAt: "asc" },
  });
  return clenstvi.map((c) => ({
    jmeno: c.hudebnik.jmeno,
    role: c.role,
    nastroj: c.nastroj,
    obdobiOd: c.obdobiOd,
    obdobiDo: c.obdobiDo,
  }));
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "Access-Control-Allow-Methods": "GET, OPTIONS" },
  });
}

export async function GET(req: NextRequest) {
  const jmeno = req.nextUrl.searchParams.get("jmeno")?.trim();
  const skladba = req.nextUrl.searchParams.get("skladba")?.trim() || null;
  if (!jmeno) {
    return NextResponse.json({ nalezena: false }, { headers: CORS_HEADERS });
  }

  const kandidati = await kandidatiPodleJmena(jmeno);
  const interpret = await vyberInterpreta(kandidati, skladba);
  if (!interpret) {
    return NextResponse.json({ nalezena: false }, { headers: CORS_HEADERS });
  }

  const [pribehy, udalosti, sestava] = await Promise.all([
    najdiVerejnePribehy(interpret.id),
    najdiVerejneUdalosti(interpret.nazev),
    najdiSestavu(interpret.id),
  ]);
  const kratkyPribeh = pribehy.length > 0
    ? zkratit(pribehy[0].obsah, MAX_DELKA_PRIBEHU)
    : (interpret.historie ? zkratit(interpret.historie, MAX_DELKA_PRIBEHU) : null);

  return NextResponse.json(
    {
      nalezena: true,
      nazev: interpret.nazev,
      pribehy: pribehy.map((p) => ({ nadpis: p.nadpis, obsah: p.obsah })),
      udalosti: udalosti.map((u) => ({ nazev: u.nazev, datum: u.datum, popis: u.popis })),
      sestava,
      historie: interpret.historie ?? "",
      kratkyPribeh: kratkyPribeh ?? "",
    },
    {
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}

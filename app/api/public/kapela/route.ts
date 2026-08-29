// app/api/public/kapela/route.ts
//
// Veřejný, neautentizovaný endpoint pro dotaz "co víme o téhle kapele" -
// používá ho např. web Rádia Muflon a appka muflon-stats k obohacení
// živého logu o krátký text ke hrajícímu interpretovi.
//
// Request:
// GET /api/public/kapela?jmeno=<nazev interpreta>
//
// Response:
// { "nalezena": true, "nazev": "...", "kratkyPribeh": "..." }
// { "nalezena": false }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Endpoint je veřejný a čte se z libovolné domény (web Rádia Muflon běží
// jinde než muflon-core), proto CORS povolujeme pro kohokoliv.
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

// Kolik znaků smí mít vrácený "krátký" příběh - jde o stručnou ukázku,
// ne celý článek.
const MAX_DELKA_PRIBEHU = 500;

// Stavy příběhu, které jsou dost prověřené na to, aby šly ven veřejně.
const VEREJNE_STAVY_PRIBEHU = ["schvaleno", "publikovano"];

function zkratit(text: string, max: number): string {
  const oriznuty = text.trim();
  if (oriznuty.length <= max) return oriznuty;
  const useknuty = oriznuty.slice(0, max);
  const posledniMezera = useknuty.lastIndexOf(" ");
  const zaklad = posledniMezera > 0 ? useknuty.slice(0, posledniMezera) : useknuty;
  return `${zaklad.trim()}…`;
}

async function najdiInterpreta(jmeno: string) {
  const exaktni = await prisma.interpret.findFirst({
    where: { nazev: { equals: jmeno, mode: "insensitive" } },
  });
  if (exaktni) return exaktni;

  // Zkus i alternativní názvy (JSON pole stringů) - metadata ze streamu
  // často používají jiný tvar jména než hlavní záznam v databázi.
  const sAlternativami = await prisma.interpret.findMany({
    where: { alternativniNazvy: { not: null } },
    select: { id: true, alternativniNazvy: true },
  });
  const cil = jmeno.trim().toLowerCase();
  const shoda = sAlternativami.find((i) => {
    try {
      const alt = JSON.parse(i.alternativniNazvy ?? "[]");
      return Array.isArray(alt) && alt.some((a) => String(a).trim().toLowerCase() === cil);
    } catch {
      return false;
    }
  });
  if (shoda) return prisma.interpret.findUnique({ where: { id: shoda.id } });

  return prisma.interpret.findFirst({
    where: { nazev: { contains: jmeno, mode: "insensitive" } },
  });
}

async function najdiKratkyPribeh(interpretId: string): Promise<string | null> {
  const vazby = await prisma.vazba.findMany({
    where: { zdrojovyTyp: "Pribeh", cilovyTyp: "Interpret", cilovyId: interpretId },
  });
  if (vazby.length > 0) {
    const pribehy = await prisma.pribeh.findMany({
      where: { id: { in: vazby.map((v) => v.zdrojovyId) }, stav: { in: VEREJNE_STAVY_PRIBEHU } },
      orderBy: { updatedAt: "desc" },
    });
    if (pribehy.length > 0) return zkratit(pribehy[0].obsah, MAX_DELKA_PRIBEHU);
  }
  return null;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "Access-Control-Allow-Methods": "GET, OPTIONS" },
  });
}

export async function GET(req: NextRequest) {
  const jmeno = req.nextUrl.searchParams.get("jmeno")?.trim();
  if (!jmeno) {
    return NextResponse.json({ nalezena: false }, { headers: CORS_HEADERS });
  }

  const interpret = await najdiInterpreta(jmeno);
  if (!interpret) {
    return NextResponse.json({ nalezena: false }, { headers: CORS_HEADERS });
  }

  const kratkyPribeh =
    (await najdiKratkyPribeh(interpret.id)) ??
    (interpret.historie ? zkratit(interpret.historie, MAX_DELKA_PRIBEHU) : null);

  return NextResponse.json(
    { nalezena: true, nazev: interpret.nazev, kratkyPribeh: kratkyPribeh ?? "" },
    {
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}

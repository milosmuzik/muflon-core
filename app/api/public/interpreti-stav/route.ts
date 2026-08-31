// app/api/public/interpreti-stav/route.ts
//
// Lehký, neautentizovaný stavový přehled pro automatizaci (rutinu
// doplňování Referenčních karet a její hlídací kontrolu) - jedno malé
// JSON volání místo procházení a curlování stovek jednotlivých stránek
// /interpreti/{id} jen kvůli zjištění, kdo už má hotovou kartu.
//
// GET /api/public/interpreti-stav
// { "celkem": number, "hotovo": number,
//   "interpreti": [{ "id", "nazev", "hotovo": boolean }, ...] }  // abecedně

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const interpreti = await prisma.interpret.findMany({
    orderBy: { nazev: "asc" },
    select: { id: true, nazev: true, urovenKarty: true },
  });

  const seznam = interpreti.map((i) => ({
    id: i.id,
    nazev: i.nazev,
    hotovo: i.urovenKarty === "referencni",
  }));

  return NextResponse.json(
    {
      celkem: seznam.length,
      hotovo: seznam.filter((i) => i.hotovo).length,
      interpreti: seznam,
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
  );
}

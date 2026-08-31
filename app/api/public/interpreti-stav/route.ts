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

// Bez tohohle Next.js handler (žádné searchParams/cookies/headers) staticky
// vygeneruje při buildu a pak servíruje navždy stejnou odpověď (ověřeno:
// "age" v hlavičce rostlo bez omezení, i po reálné změně dat v DB) - přesně
// to, co má tenhle endpoint pro automatizaci sledující živý stav zabránit.
export const dynamic = "force-dynamic";

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
    { headers: { "Cache-Control": "no-store" } }
  );
}

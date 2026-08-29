// app/api/public/kalendar/route.ts
//
// Veřejný, neautentizovaný endpoint pro "co se stalo v hudbě dnes" -
// používá ho web Rádia Muflon pro sekci Muflóní kalendář.
//
// Request:
// GET /api/public/kalendar
//
// Response:
// { "udalosti": [{ "nazev", "typ", "popis" }] }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

// Jen dost prověřené záznamy smí ven veřejně - stejná politika jako
// u ostatních veřejných endpointů (viz app/api/public/kapela).
const VEREJNE_STAVY = ["schvaleno", "publikovano"];

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

export async function GET() {
  const dnes = new Date();
  const mmdd = `${String(dnes.getMonth() + 1).padStart(2, "0")}-${String(dnes.getDate()).padStart(2, "0")}`;
  const iso = dnes.toISOString().slice(0, 10);

  const udalosti = await prisma.udalost.findMany({
    where: { datum: { in: [mmdd, iso] }, stav: { in: VEREJNE_STAVY } },
    orderBy: { createdAt: "asc" },
    select: { nazev: true, typ: true, popis: true },
  });

  return NextResponse.json({ udalosti }, { headers: CORS_HEADERS });
}

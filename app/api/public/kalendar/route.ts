import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isoPraha, mmddPraha } from "@/lib/cas";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };
const VEREJNE_STAVY = ["schvaleno", "publikovano"];

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

export async function GET() {
  const mmdd = mmddPraha();
  const iso = isoPraha();

  const udalosti = await prisma.udalost.findMany({
    where: { datum: { in: [mmdd, iso] }, stav: { in: VEREJNE_STAVY } },
    orderBy: { createdAt: "asc" },
    select: { nazev: true, typ: true, popis: true },
  });

  return NextResponse.json({ udalosti, den: mmdd }, { headers: CORS_HEADERS });
}

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

  // Katalog ukládá výročí jako MM-DD. AI návrhy kalendáře často jako
  // YYYY-MM-DD (rok, kdy se to stalo). Interní kalendář bere den z poslední
  // části, veřejné API dřív chtělo přesnou shodu — 2015-10-04 proto na
  // radiomuflon.cz neprošlo, i když bylo schválené.
  const udalosti = await prisma.udalost.findMany({
    where: {
      stav: { in: VEREJNE_STAVY },
      OR: [{ datum: mmdd }, { datum: iso }, { datum: { endsWith: `-${mmdd}` } }],
    },
    orderBy: { createdAt: "asc" },
    select: { nazev: true, typ: true, popis: true },
  });

  return NextResponse.json({ udalosti, den: mmdd }, { headers: CORS_HEADERS });
}

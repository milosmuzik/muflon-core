import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isoPraha, mmddPraha } from "@/lib/cas";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };
const VEREJNE_STAVY = ["schvaleno", "publikovano"];

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

function rokZData(datum: string): string | null {
  const m = datum.match(/^(\d{4})-\d{2}-\d{2}$/);
  return m ? m[1] : null;
}

function popisSRokem(popis: string | null, datum: string): string | null {
  const rok = rokZData(datum);
  if (!rok) return popis;
  if (popis && popis.includes(rok)) return popis;
  if (!popis) return rok;
  const bezTecky = popis.replace(/\s*$/, "").replace(/\.$/, "");
  return `${bezTecky} (${rok}).`;
}

export async function GET() {
  const mmdd = mmddPraha();
  const iso = isoPraha();

  // Katalog ukládá výročí jako MM-DD. AI návrhy kalendáře často jako
  // YYYY-MM-DD (rok, kdy se to stalo). Interní kalendář bere den z poslední
  // části, veřejné API dřív chtělo přesnou shodu — 2015-10-04 proto na
  // radiomuflon.cz neprošlo, i když bylo schválené.
  // Web rádia vypisuje jen název a popis, rok proto patří do popisu.
  const udalosti = await prisma.udalost.findMany({
    where: {
      stav: { in: VEREJNE_STAVY },
      OR: [{ datum: mmdd }, { datum: iso }, { datum: { endsWith: `-${mmdd}` } }],
    },
    orderBy: { createdAt: "asc" },
    select: { nazev: true, typ: true, popis: true, datum: true },
  });

  return NextResponse.json(
    {
      udalosti: udalosti.map((u) => ({
        nazev: u.nazev,
        typ: u.typ,
        popis: popisSRokem(u.popis, u.datum),
        datum: u.datum,
      })),
      den: mmdd,
    },
    { headers: CORS_HEADERS }
  );
}

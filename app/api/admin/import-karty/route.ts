import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { importujKartu, type Karta } from "@/lib/import-karta";

const MAX_KARET_NA_VOLANI = 10;

export async function POST(req: NextRequest) {
  const ocekavany = process.env.IMPORT_API_KEY;
  const klic = req.headers.get("x-import-key");
  if (!ocekavany || !klic || klic !== ocekavany) {
    return NextResponse.json({ chyba: "Neplatný nebo chybějící X-Import-Key." }, { status: 401 });
  }

  let telo: { karty: Karta[] };
  try {
    telo = await req.json();
  } catch {
    return NextResponse.json({ chyba: "Neplatné JSON tělo požadavku." }, { status: 400 });
  }

  if (!Array.isArray(telo.karty) || telo.karty.length === 0) {
    return NextResponse.json({ chyba: "Pole 'karty' je prázdné nebo chybí." }, { status: 400 });
  }
  if (telo.karty.length > MAX_KARET_NA_VOLANI) {
    return NextResponse.json(
      { chyba: `Maximálně ${MAX_KARET_NA_VOLANI} karet na jedno volání, přišlo ${telo.karty.length}.` },
      { status: 400 }
    );
  }

  const vysledky = [];
  const chyby = [];
  for (const karta of telo.karty) {
    try {
      const vysledek = await importujKartu(prisma, karta);
      vysledky.push(vysledek);
    } catch (e: any) {
      chyby.push({ nazev: karta?.nazev ?? "neznámý", chyba: String(e?.message ?? e) });
    }
  }

  return NextResponse.json({ vysledky, chyby }, { status: chyby.length > 0 ? 207 : 200 });
}

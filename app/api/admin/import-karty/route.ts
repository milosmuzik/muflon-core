// app/api/admin/import-karty/route.ts
//
// Chráněný endpoint pro dávkový import Referenčních karet (MS-2.0).
// Volá ho MCP server jménem Claude - nikdy ho nedávej veřejně bez klíče.
//
// Vyžaduje env proměnnou IMPORT_API_KEY (vygeneruj vlastní náhodný
// řetězec, stejně jako máš CRON_SECRET).
//
// Request:
// POST /api/admin/import-karty
// Header: X-Import-Key: <IMPORT_API_KEY>
// Body: { "karty": [ {...}, {...} ] } (1-10 karet na volání)
//
// Response: { "vysledky": [ {...pocty...}, ... ] }

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { importujKartu, type Karta } from "@/lib/import-karta";

const prisma = new PrismaClient();

const MAX_KARET_NA_VOLANI = 10;

export async function POST(req: NextRequest) {
  const klic = req.headers.get("x-import-key");
  if (!klic || klic !== process.env.IMPORT_API_KEY) {
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

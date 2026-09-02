import { NextRequest, NextResponse } from "next/server";
import { doplnitKatalogDavku } from "@/lib/agent/doplnit-katalog";
import { geminiJeDostupne } from "@/lib/agent/gemini";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const hlavicka = request.headers.get("authorization");
  if (hlavicka !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Neautorizováno" }, { status: 401 });
  }

  try {
    const vysledek = await doplnitKatalogDavku(4);
    const kvota = vysledek.chyby.some((c) => /kvóta|429|RESOURCE_EXHAUSTED/i.test(c));
    return NextResponse.json({
      ...vysledek,
      gemini: geminiJeDostupne() && !kvota ? "ok" : "ceka_na_obnovu",
      cekamNaGemini: kvota,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

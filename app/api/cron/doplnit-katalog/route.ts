import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { doplnitKatalogDavku } from "@/lib/agent/doplnit-katalog";
import { geminiJeDostupne } from "@/lib/agent/gemini";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const hlavicka = request.headers.get("authorization");
  if (hlavicka !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Neautorizováno" }, { status: 401 });
  }

  try {
    const [celkem, hotovo] = await Promise.all([
      prisma.interpret.count(),
      prisma.interpret.count({ where: { urovenKarty: "referencni" } }),
    ]);

    if (celkem > 0 && hotovo >= celkem) {
      return NextResponse.json({
        hotovo: true,
        preskoceno: true,
        kapely: `${hotovo}/${celkem}`,
        zpracovano: 0,
        doplneno: 0,
        zdroje: 0,
        polozky: [],
        chyby: [],
      });
    }

    const vysledek = await doplnitKatalogDavku(4);
    const kvota = vysledek.chyby.some((c) => /kvóta|429|RESOURCE_EXHAUSTED/i.test(c));
    return NextResponse.json({
      ...vysledek,
      hotovo: false,
      preskoceno: false,
      kapely: `${hotovo}/${celkem}`,
      gemini: geminiJeDostupne() && !kvota ? "ok" : "ceka_na_obnovu",
      cekamNaGemini: kvota,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

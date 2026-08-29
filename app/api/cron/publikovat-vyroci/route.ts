// app/api/cron/publikovat-vyroci/route.ts
//
// Denní automatická publikace na sociální sítě (Facebook + Instagram + X).
// Běží večer, po ranním navrhy-kalendar cronu, který na dnešek navrhne
// a případně auto-schválí kalendářní výročí. Výběr, CO se publikuje, se
// neděje ručně - bere se první dnešní výročí ve stavu "schvaleno"/
// "publikovano" (tzn. prošlo trust politikou ze zdroje), které tento rok
// na dané síti ještě nebylo publikováno. Max 1 příspěvek/den/síť, aby
// se malý účet (řádově stovky sledujících) nezahltil.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publikovatNaFacebook, publikovatNaInstagram, publikovatNaX } from "@/lib/actions/socialni";

export const maxDuration = 30;

const VEREJNE_STAVY = ["schvaleno", "publikovano"];

async function jizLetosPublikovano(udalostId: string, platforma: string, letosniZacatek: Date) {
  const zaznam = await prisma.publikace.findFirst({
    where: { udalostId, platforma, stav: "publikovano", publikovanoV: { gte: letosniZacatek } },
  });
  return !!zaznam;
}

export async function GET(request: NextRequest) {
  const hlavicka = request.headers.get("authorization");
  if (hlavicka !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Neautorizováno" }, { status: 401 });
  }

  const dnes = new Date();
  const mmdd = `${String(dnes.getMonth() + 1).padStart(2, "0")}-${String(dnes.getDate()).padStart(2, "0")}`;
  const iso = dnes.toISOString().slice(0, 10);
  const letosniZacatek = new Date(Date.UTC(dnes.getUTCFullYear(), 0, 1));

  const kandidati = await prisma.udalost.findMany({
    where: { datum: { in: [mmdd, iso] }, stav: { in: VEREJNE_STAVY } },
    orderBy: { createdAt: "asc" },
  });

  let publikovanoFacebook = null as string | null;
  let publikovanoInstagram = null as string | null;
  let publikovanoX = null as string | null;

  for (const udalost of kandidati) {
    if (!publikovanoFacebook && !(await jizLetosPublikovano(udalost.id, "facebook", letosniZacatek))) {
      if (!udalost.zverejnitNaSitich) {
        await prisma.udalost.update({ where: { id: udalost.id }, data: { zverejnitNaSitich: true } });
      }
      await publikovatNaFacebook(udalost.id);
      publikovanoFacebook = udalost.nazev;
    }
    if (!publikovanoInstagram && !(await jizLetosPublikovano(udalost.id, "instagram", letosniZacatek))) {
      await publikovatNaInstagram(udalost.id);
      publikovanoInstagram = udalost.nazev;
    }
    if (!publikovanoX && !(await jizLetosPublikovano(udalost.id, "x", letosniZacatek))) {
      await publikovatNaX(udalost.id);
      publikovanoX = udalost.nazev;
    }
    if (publikovanoFacebook && publikovanoInstagram && publikovanoX) break;
  }

  return NextResponse.json({ kandidatu: kandidati.length, publikovanoFacebook, publikovanoInstagram, publikovanoX });
}

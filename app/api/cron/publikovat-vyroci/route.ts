import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publikovatNaFacebook, publikovatNaInstagram, publikovatNaX } from "@/lib/actions/socialni";
import { overCron } from "@/lib/over-cron";
import { isoPraha, mmddPraha, zacatekRokuUtc } from "@/lib/cas";

export const maxDuration = 30;

const VEREJNE_STAVY = ["schvaleno", "publikovano"];

async function jizLetosPublikovano(udalostId: string, platforma: string, letosniZacatek: Date) {
  const zaznam = await prisma.publikace.findFirst({
    where: { udalostId, platforma, stav: "publikovano", publikovanoV: { gte: letosniZacatek } },
  });
  return !!zaznam;
}

export async function GET(request: NextRequest) {
  const zamitnout = overCron(request);
  if (zamitnout) return zamitnout;

  const mmdd = mmddPraha();
  const iso = isoPraha();
  const letosniZacatek = zacatekRokuUtc();

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

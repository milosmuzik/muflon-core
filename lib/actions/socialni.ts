"use server";

import { prisma } from "@/lib/prisma";
import { publikujNaFacebook } from "@/lib/socialni/facebook";
import { publikujNaInstagram } from "@/lib/socialni/instagram";
import { zapisHistorii } from "@/lib/history";
import { revalidatePath } from "next/cache";

function sestavText(udalost: { nazev: string; popis: string | null }): string {
  const zaklad = udalost.popis ? `${udalost.nazev}\n\n${udalost.popis}` : udalost.nazev;
  return `${zaklad}\n\n#RadioMuflon #MufloniKalendar`;
}

function verejnaUrlObrazku(id: string): string {
  const zaklad = process.env.NEXT_PUBLIC_APP_URL || "https://muflon-core.vercel.app";
  return `${zaklad}/api/socialni/obrazek/${id}`;
}

export async function publikovatNaFacebook(udalostId: string) {
  const udalost = await prisma.udalost.findUnique({ where: { id: udalostId } });
  if (!udalost) return;

  const vysledek = await publikujNaFacebook(sestavText(udalost), verejnaUrlObrazku(udalost.id));

  await prisma.publikace.create({
    data: {
      udalostId, platforma: "facebook",
      stav: vysledek.uspech ? "publikovano" : "chyba",
      externiId: vysledek.externiId, chybaText: vysledek.chyba,
      publikovanoV: vysledek.uspech ? new Date() : null,
    },
  });
  await zapisHistorii("Udalost", udalostId, "upraveno", vysledek.uspech ? "Publikováno na Facebook" : `Chyba publikace na Facebook: ${vysledek.chyba}`);
  revalidatePath(`/udalosti/${udalostId}`);
}

export async function publikovatNaInstagram(udalostId: string) {
  const udalost = await prisma.udalost.findUnique({ where: { id: udalostId } });
  if (!udalost) return;

  const vysledek = await publikujNaInstagram(verejnaUrlObrazku(udalost.id), sestavText(udalost));

  await prisma.publikace.create({
    data: {
      udalostId, platforma: "instagram",
      stav: vysledek.uspech ? "publikovano" : "chyba",
      externiId: vysledek.externiId, chybaText: vysledek.chyba,
      publikovanoV: vysledek.uspech ? new Date() : null,
    },
  });
  await zapisHistorii("Udalost", udalostId, "upraveno", vysledek.uspech ? "Publikováno na Instagram" : `Chyba publikace na Instagram: ${vysledek.chyba}`);
  revalidatePath(`/udalosti/${udalostId}`);
}

"use server";

import { prisma } from "@/lib/prisma";
import { publikujNaFacebook } from "@/lib/socialni/facebook";
import { publikujNaInstagram } from "@/lib/socialni/instagram";
import { publikujNaX } from "@/lib/socialni/x";
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

type Platforma = "facebook" | "instagram";

/**
 * Publikuje událost na jednu platformu, zapíše výsledek do Publikace a
 * historie a VRÁTÍ, jestli se to povedlo – cron podle toho pozná, že má
 * zkusit dalšího kandidáta, místo aby neúspěch vykázal jako úspěch.
 */
export async function publikovatUdalost(udalostId: string, platforma: Platforma): Promise<boolean> {
  const udalost = await prisma.udalost.findUnique({ where: { id: udalostId } });
  if (!udalost) return false;

  const vysledek =
    platforma === "facebook"
      ? await publikujNaFacebook(sestavText(udalost), verejnaUrlObrazku(udalost.id))
      : await publikujNaInstagram(verejnaUrlObrazku(udalost.id), sestavText(udalost));
  const nazevPlatformy = platforma === "facebook" ? "Facebook" : "Instagram";

  await prisma.publikace.create({
    data: {
      udalostId, platforma,
      stav: vysledek.uspech ? "publikovano" : "chyba",
      externiId: vysledek.externiId, chybaText: vysledek.chyba,
      publikovanoV: vysledek.uspech ? new Date() : null,
    },
  });
  await zapisHistorii("Udalost", udalostId, "upraveno", vysledek.uspech ? `Publikováno na ${nazevPlatformy}` : `Chyba publikace na ${nazevPlatformy}: ${vysledek.chyba}`);
  revalidatePath(`/udalosti/${udalostId}`);
  return vysledek.uspech;
}

export async function publikovatNaFacebook(udalostId: string) {
  await publikovatUdalost(udalostId, "facebook");
}

export async function publikovatNaInstagram(udalostId: string) {
  await publikovatUdalost(udalostId, "instagram");
}

export async function publikovatNaX(udalostId: string) {
  const udalost = await prisma.udalost.findUnique({ where: { id: udalostId } });
  if (!udalost) return;

  const vysledek = await publikujNaX(sestavText(udalost), verejnaUrlObrazku(udalost.id));

  await prisma.publikace.create({
    data: {
      udalostId, platforma: "x",
      stav: vysledek.uspech ? "publikovano" : "chyba",
      externiId: vysledek.externiId, chybaText: vysledek.chyba,
      publikovanoV: vysledek.uspech ? new Date() : null,
    },
  });
  await zapisHistorii("Udalost", udalostId, "upraveno", vysledek.uspech ? "Publikováno na X" : `Chyba publikace na X: ${vysledek.chyba}`);
  revalidatePath(`/udalosti/${udalostId}`);
}

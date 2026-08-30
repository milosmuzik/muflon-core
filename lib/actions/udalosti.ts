"use server";

import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { zjistiVice } from "@/lib/agent/zjisti-vice";
import { POZNAMKA_AI_ROZSIRENI, nazevZeZdroje, urovenDuveryZeZdroje } from "@/lib/constants";
import { zvazAutomatickeSchvaleni } from "@/lib/actions/spolecne";

const PLATNE_KATEGORIE = new Set(["oficialni_web", "socialni_site", "archivni", "databaze", "media", "rozhovor", "kniha", "orientacni"]);

export async function rozsiritUdalost(id: string) {
  const udalost = await prisma.udalost.findUnique({ where: { id } });
  if (!udalost) return;

  const vysledek = await zjistiVice(udalost.nazev, udalost.popis);
  if (!vysledek.rozsireni) return;

  const novyPopis = udalost.popis ? `${udalost.popis}\n\n${vysledek.rozsireni}` : vysledek.rozsireni;
  await prisma.udalost.update({ where: { id }, data: { popis: novyPopis } });

  for (const z of vysledek.zdroje || []) {
    if (!z.url) continue;
    const existuje = await prisma.zdroj.findFirst({ where: { cilovyTyp: "Udalost", cilovyId: id, url: z.url } });
    if (!existuje) {
      const kategorie = PLATNE_KATEGORIE.has(z.kategorie) ? z.kategorie : "orientacni";
      const uroverDuvery = urovenDuveryZeZdroje(kategorie, z.url);
      await prisma.zdroj.create({
        data: {
          cilovyTyp: "Udalost", cilovyId: id, nazev: nazevZeZdroje(z.url, z.nazev), url: z.url,
          kategorie,
          uroverDuvery, poznamka: POZNAMKA_AI_ROZSIRENI,
        },
      });
      await zvazAutomatickeSchvaleni("Udalost", id, uroverDuvery);
    }
  }

  await zapisHistorii("Udalost", id, "upraveno", "Rozšířeno přes AI (Zjisti více)");
  revalidatePath(`/udalosti/${id}`);
}

export async function vytvoritUdalost(formData: FormData) {
  const nazev = String(formData.get("nazev") || "").trim();
  const datum = String(formData.get("datum") || "").trim();
  if (!nazev || !datum) return;

  const udalost = await prisma.udalost.create({
    data: {
      nazev,
      datum,
      typ: String(formData.get("typ") || "jina"),
      opakujeSe: formData.get("opakujeSe") === "on",
      popis: String(formData.get("popis") || "").trim() || null,
    },
  });
  await zapisHistorii("Udalost", udalost.id, "vytvoreno", `Založena událost ${nazev}`);
  revalidatePath("/udalosti");
  redirect(`/udalosti/${udalost.id}`);
}

export async function upravitUdalost(id: string, formData: FormData) {
  const nazev = String(formData.get("nazev") || "").trim();
  const datum = String(formData.get("datum") || "").trim();
  if (!nazev || !datum) return;

  await prisma.udalost.update({
    where: { id },
    data: {
      nazev,
      datum,
      typ: String(formData.get("typ") || "jina"),
      opakujeSe: formData.get("opakujeSe") === "on",
      popis: String(formData.get("popis") || "").trim() || null,
    },
  });
  await zapisHistorii("Udalost", id, "upraveno");
  revalidatePath(`/udalosti/${id}`);
}

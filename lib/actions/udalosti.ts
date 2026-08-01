"use server";

import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

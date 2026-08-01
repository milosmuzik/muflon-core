"use server";

import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function vytvoritSkladbu(formData: FormData) {
  const nazev = String(formData.get("nazev") || "").trim();
  if (!nazev) return;

  const albumNazev = String(formData.get("albumNazev") || "").trim();
  let albumId: string | null = null;
  if (albumNazev) {
    const album = await prisma.album.findFirst({ where: { nazev: albumNazev } });
    albumId = album?.id ?? null;
  }

  const skladba = await prisma.skladba.create({
    data: {
      nazev,
      verze: String(formData.get("verze") || "").trim() || null,
      albumId,
      datumPrvnihoVydani: String(formData.get("datumPrvnihoVydani") || "").trim() || null,
      vPlaylistu: formData.get("vPlaylistu") === "on",
      poznamka: String(formData.get("poznamka") || "").trim() || null,
    },
  });

  const interpretNazev = String(formData.get("interpretNazev") || "").trim();
  if (interpretNazev) {
    let interpret = await prisma.interpret.findFirst({ where: { nazev: interpretNazev } });
    if (!interpret) {
      interpret = await prisma.interpret.create({ data: { nazev: interpretNazev } });
    }
    await prisma.skladbaInterpret.create({ data: { skladbaId: skladba.id, interpretId: interpret.id } });
  }

  await zapisHistorii("Skladba", skladba.id, "vytvoreno", `Založena skladba ${nazev}`);
  revalidatePath("/skladby");
  redirect(`/skladby/${skladba.id}`);
}

export async function upravitSkladbu(id: string, formData: FormData) {
  const nazev = String(formData.get("nazev") || "").trim();
  if (!nazev) return;

  await prisma.skladba.update({
    where: { id },
    data: {
      nazev,
      verze: String(formData.get("verze") || "").trim() || null,
      datumPrvnihoVydani: String(formData.get("datumPrvnihoVydani") || "").trim() || null,
      vPlaylistu: formData.get("vPlaylistu") === "on",
      poznamka: String(formData.get("poznamka") || "").trim() || null,
    },
  });
  await zapisHistorii("Skladba", id, "upraveno");
  revalidatePath(`/skladby/${id}`);
}

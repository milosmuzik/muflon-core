"use server";

import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function vytvoritAlbum(formData: FormData) {
  const nazev = String(formData.get("nazev") || "").trim();
  if (!nazev) return;

  const album = await prisma.album.create({
    data: {
      nazev,
      datumVydani: String(formData.get("datumVydani") || "").trim() || null,
      vydavatel: String(formData.get("vydavatel") || "").trim() || null,
      poznamka: String(formData.get("poznamka") || "").trim() || null,
    },
  });

  const interpretNazev = String(formData.get("interpretNazev") || "").trim();
  if (interpretNazev) {
    let interpret = await prisma.interpret.findFirst({ where: { nazev: interpretNazev } });
    if (!interpret) {
      interpret = await prisma.interpret.create({ data: { nazev: interpretNazev } });
    }
    await prisma.albumInterpret.create({ data: { albumId: album.id, interpretId: interpret.id } });
  }

  await zapisHistorii("Album", album.id, "vytvoreno", `Založeno album ${nazev}`);
  revalidatePath("/alba");
  redirect(`/alba/${album.id}`);
}

export async function upravitAlbum(id: string, formData: FormData) {
  const nazev = String(formData.get("nazev") || "").trim();
  if (!nazev) return;

  await prisma.album.update({
    where: { id },
    data: {
      nazev,
      datumVydani: String(formData.get("datumVydani") || "").trim() || null,
      vydavatel: String(formData.get("vydavatel") || "").trim() || null,
      poznamka: String(formData.get("poznamka") || "").trim() || null,
    },
  });
  await zapisHistorii("Album", id, "upraveno");
  revalidatePath(`/alba/${id}`);
}

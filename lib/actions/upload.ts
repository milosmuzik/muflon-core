"use server";

import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { revalidatePath } from "next/cache";

export async function nahratFotkuUdalosti(udalostId: string, formData: FormData) {
  const soubor = formData.get("foto") as File | null;
  if (!soubor || soubor.size === 0) return;

  const pripona = soubor.name.split(".").pop() || "jpg";
  const blob = await put(`udalosti/${udalostId}-${Date.now()}.${pripona}`, soubor, {
    access: "public",
  });

  await prisma.udalost.update({
    where: { id: udalostId },
    data: { fotoUrl: blob.url },
  });
  await zapisHistorii("Udalost", udalostId, "upraveno", "Nahrána fotka pro sociální grafiku");
  revalidatePath(`/udalosti/${udalostId}`);
}

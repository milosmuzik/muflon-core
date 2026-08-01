"use server";

import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function vytvoritHudebnika(formData: FormData) {
  const jmeno = String(formData.get("jmeno") || "").trim();
  if (!jmeno) return;

  const hudebnik = await prisma.hudebnik.create({
    data: {
      jmeno,
      pseudonymy: String(formData.get("pseudonymy") || "").trim() || null,
      datumNarozeni: String(formData.get("datumNarozeni") || "").trim() || null,
      datumUmrti: String(formData.get("datumUmrti") || "").trim() || null,
      poznamka: String(formData.get("poznamka") || "").trim() || null,
    },
  });
  await zapisHistorii("Hudebnik", hudebnik.id, "vytvoreno", `Založen hudebník ${jmeno}`);
  revalidatePath("/hudebnici");
  redirect(`/hudebnici/${hudebnik.id}`);
}

export async function upravitHudebnika(id: string, formData: FormData) {
  const jmeno = String(formData.get("jmeno") || "").trim();
  if (!jmeno) return;

  await prisma.hudebnik.update({
    where: { id },
    data: {
      jmeno,
      pseudonymy: String(formData.get("pseudonymy") || "").trim() || null,
      datumNarozeni: String(formData.get("datumNarozeni") || "").trim() || null,
      datumUmrti: String(formData.get("datumUmrti") || "").trim() || null,
      poznamka: String(formData.get("poznamka") || "").trim() || null,
    },
  });
  await zapisHistorii("Hudebnik", id, "upraveno");
  revalidatePath(`/hudebnici/${id}`);
}

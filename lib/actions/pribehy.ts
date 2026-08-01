"use server";

import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function vytvoritPribeh(formData: FormData) {
  const nadpis = String(formData.get("nadpis") || "").trim();
  const obsah = String(formData.get("obsah") || "").trim();
  if (!nadpis || !obsah) return;

  const pribeh = await prisma.pribeh.create({ data: { nadpis, obsah } });
  await zapisHistorii("Pribeh", pribeh.id, "vytvoreno", `Založen příběh ${nadpis}`);
  revalidatePath("/pribehy");
  redirect(`/pribehy/${pribeh.id}`);
}

export async function upravitPribeh(id: string, formData: FormData) {
  const nadpis = String(formData.get("nadpis") || "").trim();
  const obsah = String(formData.get("obsah") || "").trim();
  if (!nadpis || !obsah) return;

  await prisma.pribeh.update({ where: { id }, data: { nadpis, obsah } });
  await zapisHistorii("Pribeh", id, "upraveno");
  revalidatePath(`/pribehy/${id}`);
}

"use server";

import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { revidovatPribehy, type VysledekReviziPribehu } from "@/lib/agent/revize-pribehy";

export async function vytvoritPribeh(formData: FormData) {
  const nadpis = String(formData.get("nadpis") || "").trim();
  const obsah = String(formData.get("obsah") || "").trim();
  if (!nadpis || !obsah) return;

  const pribeh = await prisma.pribeh.create({ data: { nadpis, obsah } });
  await zapisHistorii("Pribeh", pribeh.id, "vytvoreno", `Založen příběh ${nadpis}`);

  const interpretNazev = String(formData.get("interpret") || "").trim();
  if (interpretNazev) {
    const interpret = await prisma.interpret.findFirst({ where: { nazev: { contains: interpretNazev, mode: "insensitive" } } });
    if (interpret) {
      await prisma.vazba.create({
        data: { zdrojovyTyp: "Pribeh", zdrojovyId: pribeh.id, cilovyTyp: "Interpret", cilovyId: interpret.id, typVztahu: "vypráví o" },
      });
    }
  }

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

export async function spustitReviziPribehuRucne(
  _predchoziStav: VysledekReviziPribehu,
  _formData: FormData
): Promise<VysledekReviziPribehu> {
  const vysledek = await revidovatPribehy();
  revalidatePath("/pribehy");
  return vysledek;
}

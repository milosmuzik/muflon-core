"use server";

import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { opravitKartuVanaheimu } from "@/lib/homonyma/opravit-kartu";
import { jeVanaheim } from "@/lib/homonyma/vanaheim";

export async function vytvoritInterpreta(formData: FormData) {
  const nazev = String(formData.get("nazev") || "").trim();
  if (!nazev) return;

  const interpret = await prisma.interpret.create({
    data: {
      nazev,
      typ: String(formData.get("typ") || "kapela"),
      rokVzniku: formData.get("rokVzniku") ? Number(formData.get("rokVzniku")) : null,
      poznamka: String(formData.get("poznamka") || "").trim() || null,
    },
  });
  await zapisHistorii("Interpret", interpret.id, "vytvoreno", `Založen interpret ${nazev}`);
  revalidatePath("/interpreti");
  redirect(`/interpreti/${interpret.id}`);
}

export async function upravitInterpreta(id: string, formData: FormData) {
  const nazev = String(formData.get("nazev") || "").trim();
  if (!nazev) return;

  await prisma.interpret.update({
    where: { id },
    data: {
      nazev,
      typ: String(formData.get("typ") || "kapela"),
      rokVzniku: formData.get("rokVzniku") ? Number(formData.get("rokVzniku")) : null,
      stav: String(formData.get("stav") || "aktivni"),
      zeme: String(formData.get("zeme") || "").trim() || null,
      mesto: String(formData.get("mesto") || "").trim() || null,
      zanry: String(formData.get("zanry") || "").trim() || null,
      historie: String(formData.get("historie") || "").trim() || null,
      redakcniVyznam: String(formData.get("redakcniVyznam") || "").trim() || null,
      referencniId: String(formData.get("referencniId") || "").trim() || null,
      urovenKarty: String(formData.get("urovenKarty") || "navrh"),
      poznamka: String(formData.get("poznamka") || "").trim() || null,
    },
  });
  await zapisHistorii("Interpret", id, "upraveno");
  revalidatePath(`/interpreti/${id}`);
}

export async function pridatClenstvi(interpretId: string, formData: FormData) {
  const hudebnikNazev = String(formData.get("hudebnikJmeno") || "").trim();
  if (!hudebnikNazev) return;

  let hudebnik = await prisma.hudebnik.findFirst({ where: { jmeno: hudebnikNazev } });
  if (!hudebnik) {
    hudebnik = await prisma.hudebnik.create({ data: { jmeno: hudebnikNazev } });
    await zapisHistorii("Hudebnik", hudebnik.id, "vytvoreno", `Založen při přidání členství u interpreta`);
  }

  await prisma.clenstvi.create({
    data: {
      hudebnikId: hudebnik.id,
      interpretId,
      role: String(formData.get("role") || "").trim() || null,
      nastroj: String(formData.get("nastroj") || "").trim() || null,
      obdobiOd: String(formData.get("obdobiOd") || "").trim() || null,
      obdobiDo: String(formData.get("obdobiDo") || "").trim() || null,
    },
  });
  await zapisHistorii("Interpret", interpretId, "upraveno", `Řidáno členství: ${hudebnikNazev}`);
  revalidatePath(`/interpreti/${interpretId}`);
}

export async function smazatClenstvi(clenstviId: string, interpretId: string) {
  await prisma.clenstvi.delete({ where: { id: clenstviId } });
  await zapisHistorii("Interpret", interpretId, "upraveno", "Odstraněno členství");
  revalidatePath(`/interpreti/${interpretId}`);
}

export async function smazatInterpreta(id: string) {
  const interpret = await prisma.interpret.findUnique({ where: { id } });
  if (!interpret) {
    redirect("/interpreti");
  }

  await prisma.clenstvi.deleteMany({ where: { interpretId: id } });
  await prisma.albumInterpret.deleteMany({ where: { interpretId: id } });
  await prisma.skladbaInterpret.deleteMany({ where: { interpretId: id } });
  await prisma.zdroj.deleteMany({ where: { cilovyTyp: "Interpret", cilovyId: id } });
  await prisma.vazba.deleteMany({
    where: {
      OR: [
        { zdrojovyTyp: "Interpret", zdrojovyId: id },
        { cilovyTyp: "Interpret", cilovyId: id },
      ],
    },
  });
  await prisma.historieZmeny.deleteMany({ where: { entitaTyp: "Interpret", entitaId: id } });
  await prisma.interpret.delete({ where: { id } });

  revalidatePath("/interpreti");
  redirect("/interpreti");
}

export async function opravitCeskyVanaheim(interpretId: string) {
  const interpret = await prisma.interpret.findUnique({ where: { id: interpretId } });
  if (!interpret || !jeVanaheim(interpret.nazev)) {
    return { ok: false as const, chyba: "Toto není karta Vanaheim." };
  }
  const vysledky = await opravitKartuVanaheimu(prisma, interpretId);
  revalidatePath(`/interpreti/${interpretId}`);
  revalidatePath("/interpreti");
  return { ok: true as const, vysledek: vysledky[0] ?? null };
}

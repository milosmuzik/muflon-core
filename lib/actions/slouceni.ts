"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

const SLUCITELNA_POLE = ["alternativniNazvy", "rokVzniku", "zeme", "mesto", "zanry", "historie", "redakcniVyznam", "poznamka"] as const;

export async function sloucitDvojici(ponechatId: string, smazatId: string) {
  if (ponechatId === smazatId) return;

  await prisma.$transaction(async (tx) => {
    const ponechat = await tx.interpret.findUnique({ where: { id: ponechatId } });
    const smazat = await tx.interpret.findUnique({ where: { id: smazatId } });
    if (!ponechat || !smazat) return;

    const doplneni: Record<string, unknown> = {};
    for (const pole of SLUCITELNA_POLE) {
      if ((ponechat as any)[pole] == null && (smazat as any)[pole] != null) {
        doplneni[pole] = (smazat as any)[pole];
      }
    }
    if (Object.keys(doplneni).length > 0) {
      await tx.interpret.update({ where: { id: ponechatId }, data: doplneni });
    }

    const albaSmazat = await tx.albumInterpret.findMany({ where: { interpretId: smazatId } });
    for (const a of albaSmazat) {
      const existuje = await tx.albumInterpret.findFirst({ where: { interpretId: ponechatId, albumId: a.albumId } });
      if (existuje) await tx.albumInterpret.delete({ where: { id: a.id } });
      else await tx.albumInterpret.update({ where: { id: a.id }, data: { interpretId: ponechatId } });
    }

    const skladbySmazat = await tx.skladbaInterpret.findMany({ where: { interpretId: smazatId } });
    for (const s of skladbySmazat) {
      const existuje = await tx.skladbaInterpret.findFirst({ where: { interpretId: ponechatId, skladbaId: s.skladbaId } });
      if (existuje) await tx.skladbaInterpret.delete({ where: { id: s.id } });
      else await tx.skladbaInterpret.update({ where: { id: s.id }, data: { interpretId: ponechatId } });
    }

    const clenstviSmazat = await tx.clenstvi.findMany({ where: { interpretId: smazatId } });
    for (const c of clenstviSmazat) {
      const existuje = await tx.clenstvi.findFirst({
        where: { interpretId: ponechatId, hudebnikId: c.hudebnikId, obdobiOd: c.obdobiOd, obdobiDo: c.obdobiDo },
      });
      if (existuje) await tx.clenstvi.delete({ where: { id: c.id } });
      else await tx.clenstvi.update({ where: { id: c.id }, data: { interpretId: ponechatId } });
    }

    await tx.zdroj.updateMany({ where: { cilovyTyp: "Interpret", cilovyId: smazatId }, data: { cilovyId: ponechatId } });
    await tx.vazba.updateMany({ where: { cilovyTyp: "Interpret", cilovyId: smazatId }, data: { cilovyId: ponechatId } });
    await tx.vazba.updateMany({ where: { zdrojovyTyp: "Interpret", zdrojovyId: smazatId }, data: { zdrojovyId: ponechatId } });
    await tx.historieZmeny.updateMany({ where: { entitaTyp: "Interpret", entitaId: smazatId }, data: { entitaId: ponechatId } });

    await tx.interpret.delete({ where: { id: smazatId } });

    await tx.historieZmeny.create({
      data: {
        entitaTyp: "Interpret",
        entitaId: ponechatId,
        akce: "upraveno",
        popis: `Sloučeno s duplicitním záznamem „${smazat.nazev}“`,
      },
    });
  });
}

export async function sloucitSkupinu(formData: FormData) {
  const ponechatId = String(formData.get("keep") || "");
  const vsechna = formData.getAll("vsechna").map(String);
  if (!ponechatId) return;

  const kSmazani = vsechna.filter((id) => id !== ponechatId);
  for (const smazatId of kSmazani) {
    await sloucitDvojici(ponechatId, smazatId);
  }

  revalidatePath("/kontrola");
  revalidatePath("/interpreti");
}

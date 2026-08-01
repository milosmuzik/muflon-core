import { prisma } from "@/lib/prisma";

export async function zapisHistorii(
  entitaTyp: string,
  entitaId: string,
  akce: "vytvoreno" | "upraveno" | "smazano" | "zmena_stavu",
  popis?: string
) {
  await prisma.historieZmeny.create({
    data: { entitaTyp, entitaId, akce, popis },
  });
}

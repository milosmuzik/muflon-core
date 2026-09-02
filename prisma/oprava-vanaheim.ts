/**
 * V Muflonu je Vanaheim jen česká kapela z Chlumce nad Cidlinou.
 * Skript přepíše všechny záznamy tohoto jména.
 *
 *   npx tsx prisma/oprava-vanaheim.ts
 */

import { PrismaClient } from "@prisma/client";
import { VANAHEIM_HISTORIE_CZ } from "../lib/homonyma/vanaheim";

const prisma = new PrismaClient();

async function main() {
  const interpreti = await prisma.interpret.findMany({
    where: { nazev: { equals: "Vanaheim", mode: "insensitive" } },
  });

  if (interpreti.length === 0) {
    console.log("Interpret Vanaheim nenalezen.");
    return;
  }

  console.log(`Nalezeno záznamů Vanaheim: ${interpreti.length}`);

  for (const interpret of interpreti) {
    const po = await prisma.interpret.update({
      where: { id: interpret.id },
      data: {
        zeme: "Česko",
        mesto: "Chlumec nad Cidlinou",
        rokVzniku: interpret.rokVzniku ?? 2015,
        zanry: interpret.zanry ?? "heavy metal, power metal, viking metal",
        historie: VANAHEIM_HISTORIE_CZ,
        poznamka: null,
      },
    });

    await prisma.historieZmeny.create({
      data: {
        entitaTyp: "Interpret",
        entitaId: po.id,
        akce: "upraveno",
        popis: "Vanaheim sjednocen na českou kapelu z Chlumce nad Cidlinou.",
      },
    });

    console.log(`Opraveno ${po.id} → Česko / Chlumec nad Cidlinou`);
  }
}

main()
  .catch((e) => {
    console.error("Chyba:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

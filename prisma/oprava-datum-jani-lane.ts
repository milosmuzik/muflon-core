/**
 * Jednorázová oprava: nastaví správné datum u Události o úmrtí Jani Lanea.
 * Po spuštění bude mít kanonický záznam datum 08-11 (den úmrtí, ne nález těla),
 * takže ho pak audit/merge skript spojí normálně jako shluk se stejným dnem.
 *
 *   npx tsx prisma/oprava-datum-jani-lane.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ID = "b142c1e0-b460-4e37-a844-2eea52f512ca";
const SPRAVNE_DATUM = "08-11";

async function main() {
  const pred = await prisma.udalost.findUnique({ where: { id: ID } });
  if (!pred) {
    console.log(`Záznam [${ID}] nenalezen — možná už byl sloučen/smazán.`);
    return;
  }

  console.log(`Před: "${pred.nazev}" — datum: ${pred.datum}`);

  const po = await prisma.udalost.update({
    where: { id: ID },
    data: { datum: SPRAVNE_DATUM },
  });

  console.log(`Po:   "${po.nazev}" — datum: ${po.datum}`);
  console.log("\nHotovo. Teď spusť znovu audit skript — Jani Lane by se měl objevit jako běžný shluk bez ⚠️.");
}

main()
  .catch((e) => {
    console.error("Chyba:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

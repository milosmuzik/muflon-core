/**
 * Přepíše všechny záznamy Vanaheim na českou kapelu z Chlumce
 * včetně sestavy, alb, skladeb a vazeb.
 *
 *   npx tsx prisma/oprava-vanaheim.ts
 */

import { PrismaClient } from "@prisma/client";
import { opravitKartuVanaheimu } from "../lib/homonyma/opravit-kartu";

const prisma = new PrismaClient();

async function main() {
  const vysledky = await opravitKartuVanaheimu(prisma);
  if (vysledky.length === 0) {
    console.log("Interpret Vanaheim nenalezen.");
    return;
  }
  for (const v of vysledky) {
    console.log(JSON.stringify(v, null, 2));
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

/**
 * Diagnostický skript — vypíše VŠECHNA pole u Událostí, jejichž název
 * obsahuje jedno ze zadaných klíčových slov. Pomáhá zjistit, proč se
 * některé záznamy nespojily do shluku (jiný formát data, jiné psaní typu...).
 *
 *   npx tsx prisma/diagnostika-udalosti.ts runaways
 *   npx tsx prisma/diagnostika-udalosti.ts "jani lane"
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const klicovaSlova = process.argv.slice(2);
  if (klicovaSlova.length === 0) {
    console.log('Použití: npx tsx prisma/diagnostika-udalosti.ts <klíčové slovo> [další...]');
    process.exit(1);
  }

  const udalosti = await prisma.udalost.findMany({
    orderBy: { datum: "asc" },
  });

  for (const slovo of klicovaSlova) {
    const slovoLower = slovo.toLowerCase();
    const shody = udalosti.filter((u) => u.nazev.toLowerCase().includes(slovoLower));

    console.log(`\n${"=".repeat(80)}`);
    console.log(`Klíčové slovo: "${slovo}" — nalezeno ${shody.length} událostí\n`);

    for (const u of shody) {
      console.log(JSON.stringify(u, null, 2));
      console.log("-".repeat(40));
    }
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

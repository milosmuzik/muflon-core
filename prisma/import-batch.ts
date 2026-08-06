// prisma/import-batch.ts
//
// CLI varianta importu - použij, když chceš dávku naimportovat ručně
// v Codespaces bez volání API. Sdílí logiku s app/api/admin/import-karty.
//
// POUŽITÍ:
// npx tsx prisma/import-batch.ts prisma/data/batch-01.json

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import { importujKartu, type Karta } from "../lib/import-karta";

const prisma = new PrismaClient();

async function main() {
  const cesta = process.argv[2];
  if (!cesta) {
    console.error("Použití: npx tsx prisma/import-batch.ts <cesta-k-json-souboru>");
    process.exit(1);
  }
  const obsah = fs.readFileSync(cesta, "utf-8");
  const data: { karty: Karta[] } = JSON.parse(obsah);

  console.log(`Importuji dávku ${data.karty.length} interpretů...`);
  for (const karta of data.karty) {
    const vysledek = await importujKartu(prisma, karta);
    console.log(
      `✓ ${vysledek.nazev} — noví: ${vysledek.pocty.clenove} členů, ${vysledek.pocty.alba} alb, ${vysledek.pocty.skladby} skladeb, ${vysledek.pocty.udalosti} výročí, ${vysledek.pocty.pribehy} příběhů, ${vysledek.pocty.zdroje} zdrojů`
    );
  }
  console.log(`Hotovo. Naimportováno ${data.karty.length} interpretů.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

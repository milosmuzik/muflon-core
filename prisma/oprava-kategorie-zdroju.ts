/**
 * Jednorázová oprava: batch-01/02/03 importovaly Zdroje s klíči kategorie
 * (metal_archives, allmusic, musicbrainz, discogs, wikipedia, oficialni_facebook,
 * oficialni_instagram, oficialni_youtube), které neodpovídají kanonické
 * hierarchii v lib/constants.ts (KATEGORIE_ZDROJE). Tyhle záznamy pak
 * ZdrojeSekce.tsx neumí seřadit ani popsat (spadnou na prioritu 99, zobrazí
 * se syrový klíč místo českého labelu).
 *
 * Tenhle skript přemapuje už naimportované Zdroje na kanonické klíče —
 * konkrétní zdroj (Metal Archives, Wikipedia, ...) zůstává čitelný v poli
 * nazev, kategorie nese jen důvěryhodnostní úroveň dle Bible.
 *
 * Odpovídající JSON dávky (prisma/data/batch-*.json) už byly opravené přímo,
 * takže tenhle skript je potřeba spustit jen jednou na existující data v DB.
 *
 *   npx tsx prisma/oprava-kategorie-zdroju.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MAPA: Record<string, string> = {
  metal_archives: "databaze",
  allmusic: "databaze",
  musicbrainz: "databaze",
  discogs: "databaze",
  wikipedia: "orientacni",
  oficialni_facebook: "socialni_site",
  oficialni_instagram: "socialni_site",
  oficialni_youtube: "socialni_site",
};

async function main() {
  const zdroje = await prisma.zdroj.findMany({
    where: { kategorie: { in: Object.keys(MAPA) } },
  });

  // Wikidata bylo omylem uložené jako "media" místo "databaze" — dohledáme podle názvu.
  const wikidataZdroje = await prisma.zdroj.findMany({
    where: { kategorie: "media", nazev: { contains: "Wikidata" } },
  });

  if (zdroje.length === 0 && wikidataZdroje.length === 0) {
    console.log("Žádné zdroje s nekanonickou kategorií nenalezeny — není co opravovat.");
    return;
  }

  for (const z of zdroje) {
    const nova = MAPA[z.kategorie];
    await prisma.zdroj.update({ where: { id: z.id }, data: { kategorie: nova } });
    console.log(`✓ [${z.id}] "${z.nazev}": ${z.kategorie} -> ${nova}`);
  }

  for (const z of wikidataZdroje) {
    await prisma.zdroj.update({ where: { id: z.id }, data: { kategorie: "databaze" } });
    console.log(`✓ [${z.id}] "${z.nazev}": media -> databaze`);
  }

  console.log(`\nHotovo. Opraveno ${zdroje.length + wikidataZdroje.length} zdrojů.`);
}

main()
  .catch((e) => {
    console.error("Chyba:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

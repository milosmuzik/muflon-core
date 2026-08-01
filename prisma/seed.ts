import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

// Etapa 1 Bible: "správa interpretů, správa skladeb, správa vztahů."
// Tento seed naimportuje skutečný playlist Rádia Muflon (Interpret + Skladba,
// beze změny přesného názvu dle kap. 9) a založí Interprety + Skladby + jejich vazbu.

async function main() {
  const cesta = join(__dirname, "data", "playlist.tsv");
  const obsah = readFileSync(cesta, "utf-8");
  const radky = obsah.split(/\r?\n/).filter((r) => r.trim().length > 0);

  // první řádek je hlavička "Interpret\tSkladba"
  const dataRadky = radky.slice(1);

  const interpretCache = new Map<string, string>(); // nazev -> id

  let pocetInterpretu = 0;
  let pocetSkladeb = 0;

  console.log(`Nalezeno ${dataRadky.length} řádků playlistu, importuji...`);

  for (const radek of dataRadky) {
    const [interpretNazevRaw, skladbaNazevRaw] = radek.split("\t");
    if (!interpretNazevRaw || !skladbaNazevRaw) continue;

    const interpretNazev = interpretNazevRaw.trim();
    const skladbaNazev = skladbaNazevRaw.trim();
    if (!interpretNazev || !skladbaNazev) continue;

    let interpretId = interpretCache.get(interpretNazev);
    if (!interpretId) {
      // interpret může už v DB existovat (idempotentní seed)
      const existujici = await prisma.interpret.findFirst({
        where: { nazev: interpretNazev },
      });
      if (existujici) {
        interpretId = existujici.id;
      } else {
        const novy = await prisma.interpret.create({
          data: { nazev: interpretNazev, typ: "kapela", stav: "aktivni" },
        });
        interpretId = novy.id;
        pocetInterpretu++;
      }
      interpretCache.set(interpretNazev, interpretId);
    }

    // vyhni se duplicitě skladby stejného názvu u stejného interpreta
    const existujiciSkladba = await prisma.skladba.findFirst({
      where: {
        nazev: skladbaNazev,
        interpreti: { some: { interpretId } },
      },
    });
    if (existujiciSkladba) continue;

    await prisma.skladba.create({
      data: {
        nazev: skladbaNazev,
        vPlaylistu: true,
        interpreti: { create: [{ interpretId }] },
      },
    });
    pocetSkladeb++;
  }

  console.log(`Hotovo. Nových interpretů: ${pocetInterpretu}, nových skladeb: ${pocetSkladeb}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

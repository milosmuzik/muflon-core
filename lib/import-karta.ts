// prisma/fix-vazby.ts
//
// JEDNORÁZOVÝ opravný skript. Propojí příběhy a události, které vznikly
// PŘED opravou lib/import-karta.ts, s jejich interpretem přes model Vazba.
// Používá stejný trik jako link-pribehy.ts, ale cíleně jen na nadpisy/
// názvy, které jsme importovali v dávce Allen & Lande / Amaranthe / Ambush.
//
// POUŽITÍ: npx tsx prisma/fix-vazby.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mapa: nadpis příběhu / název události -> přesný název interpreta
const PRIBEHY: Record<string, string> = {
  "Projekt, který spojil dva vokální giganty": "Allen & Lande",
  "Konec bez ohlášeného konce": "Allen & Lande",
  "Jméno vynucené právníky": "Amaranthe",
  "Tři hlasy jako ochranná známka": "Amaranthe",
};

const UDALOSTI: Record<string, string> = {
  "Vznik projektu Allen/Lande a vydání alba The Battle": "Allen & Lande",
  "Vydání alba The Revenge": "Allen & Lande",
  "Vydání alba The Showdown": "Allen & Lande",
  "Vydání alba The Great Divide": "Allen & Lande",
  "Založení kapely pod názvem Avalanche": "Amaranthe",
  "Přejmenování na Amaranthe": "Amaranthe",
  "Vydání debutového alba Amaranthe": "Amaranthe",
  "Odchod Andrease Solveströma, nástup Henrika Englunda": "Amaranthe",
  "Vydání alba The Nexus": "Amaranthe",
  "Vydání alba Massive Addictive": "Amaranthe",
  "Odchod Jakea E., nástup Nilse Molina": "Amaranthe",
  "Založení kapely Ambush ve Växjö": "Ambush",
};

async function propojPribehy() {
  let propojeno = 0;
  for (const [nadpis, nazevInterpreta] of Object.entries(PRIBEHY)) {
    const pribeh = await prisma.pribeh.findFirst({ where: { nadpis } });
    const interpret = await prisma.interpret.findFirst({ where: { nazev: nazevInterpreta } });
    if (!pribeh || !interpret) {
      console.log(`⚠ Nenalezeno: příběh "${nadpis}" nebo interpret "${nazevInterpreta}"`);
      continue;
    }
    const existuje = await prisma.vazba.findFirst({
      where: { zdrojovyTyp: "Pribeh", zdrojovyId: pribeh.id, cilovyTyp: "Interpret", cilovyId: interpret.id },
    });
    if (existuje) continue;
    await prisma.vazba.create({
      data: {
        zdrojovyTyp: "Pribeh",
        zdrojovyId: pribeh.id,
        cilovyTyp: "Interpret",
        cilovyId: interpret.id,
        typVztahu: "vypráví o",
      },
    });
    propojeno++;
    console.log(`✓ Příběh "${nadpis}" → ${nazevInterpreta}`);
  }
  return propojeno;
}

async function propojUdalosti() {
  let propojeno = 0;
  for (const [nazev, nazevInterpreta] of Object.entries(UDALOSTI)) {
    const udalost = await prisma.udalost.findFirst({ where: { nazev } });
    const interpret = await prisma.interpret.findFirst({ where: { nazev: nazevInterpreta } });
    if (!udalost || !interpret) {
      console.log(`⚠ Nenalezeno: událost "${nazev}" nebo interpret "${nazevInterpreta}"`);
      continue;
    }
    const existuje = await prisma.vazba.findFirst({
      where: { zdrojovyTyp: "Udalost", zdrojovyId: udalost.id, cilovyTyp: "Interpret", cilovyId: interpret.id },
    });
    if (existuje) continue;
    await prisma.vazba.create({
      data: {
        zdrojovyTyp: "Udalost",
        zdrojovyId: udalost.id,
        cilovyTyp: "Interpret",
        cilovyId: interpret.id,
        typVztahu: "tyka_se",
      },
    });
    propojeno++;
    console.log(`✓ Událost "${nazev}" → ${nazevInterpreta}`);
  }
  return propojeno;
}

async function main() {
  const p = await propojPribehy();
  const u = await propojUdalosti();
  console.log(`\nHOTOVO. Propojeno příběhů: ${p}, událostí: ${u}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

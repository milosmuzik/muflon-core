/**
 * Merge skript: sloučí duplicitní Události nalezené audit skriptem.
 *
 * VÝCHOZÍ REŽIM = DRY-RUN. Jen vypíše, co by udělal, nic nezmění.
 *   npx tsx prisma/merge-duplicity-udalosti.ts
 *
 * Skutečné provedení (přesune Zdroj/Vazba na kanonický záznam a smaže duplicitu):
 *   npx tsx prisma/merge-duplicity-udalosti.ts --provest
 *
 * Používá stejnou detekční logiku jako prisma/audit-duplicity-udalosti.ts,
 * takže není potřeba ručně opisovat ID — pár se najde znovu při každém běhu.
 * Pokud mezi audit a merge během přibydou/uberou události, výsledek se může
 * lišit — pro jistotu doporučuju spustit audit skript těsně předtím.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TYP_UDALOST = "Udalost";
const TYP_INTERPRET = "Interpret";
const PROVEST = process.argv.includes("--provest");

interface UdalostRow {
  id: string;
  nazev: string;
  datum: string;
  denMesic: string;
  typ: string;
  stav: string;
  pocetZdroju: number;
  pocetVazeb: number;
  interpretNazvy: string[];
  createdAt: Date;
}

// ---------- normalizace + parsování data (shodné s audit skriptem) ----------

const STOPWORDA = [
  "vydani", "vydal", "vydali", "album", "alba", "od", "kapely", "kapela",
  "narozeni", "narozeniny", "umrti", "legendarniho", "legendarni",
  "debutove", "debutoveho", "debut", "zalozeni", "zalozili", "the", "a",
];

function normalizuj(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((slovo) => slovo && !STOPWORDA.includes(slovo))
    .sort()
    .join(" ");
}

function denMesicZData(datum: string): string {
  const casti = datum.split("-");
  if (casti.length === 3) return `${casti[1]}-${casti[2]}`;
  if (casti.length === 2) return datum;
  return datum;
}

function podobnost(a: string, b: string): number {
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  const prunik = [...setA].filter((slovo) => setB.has(slovo)).length;
  const sjednoceni = new Set([...setA, ...setB]).size;
  return prunik / sjednoceni;
}

async function nacistUdalosti(): Promise<UdalostRow[]> {
  const [udalosti, zdroje, vazby] = await Promise.all([
    prisma.udalost.findMany({
      select: { id: true, nazev: true, datum: true, typ: true, stav: true, createdAt: true },
    }),
    prisma.zdroj.findMany({ where: { cilovyTyp: TYP_UDALOST }, select: { cilovyId: true } }),
    prisma.vazba.findMany({
      where: { OR: [{ zdrojovyTyp: TYP_UDALOST }, { cilovyTyp: TYP_UDALOST }] },
      select: { zdrojovyTyp: true, zdrojovyId: true, cilovyTyp: true, cilovyId: true },
    }),
  ]);

  const pocetZdrojuByUdalost = new Map<string, number>();
  for (const z of zdroje) pocetZdrojuByUdalost.set(z.cilovyId, (pocetZdrojuByUdalost.get(z.cilovyId) ?? 0) + 1);

  const pocetVazebByUdalost = new Map<string, number>();
  const interpretIdByUdalost = new Map<string, Set<string>>();

  for (const v of vazby) {
    const udalostId = v.zdrojovyTyp === TYP_UDALOST ? v.zdrojovyId : v.cilovyId;
    pocetVazebByUdalost.set(udalostId, (pocetVazebByUdalost.get(udalostId) ?? 0) + 1);
    const druhaStranaTyp = v.zdrojovyTyp === TYP_UDALOST ? v.cilovyTyp : v.zdrojovyTyp;
    const druhaStranaId = v.zdrojovyTyp === TYP_UDALOST ? v.cilovyId : v.zdrojovyId;
    if (druhaStranaTyp === TYP_INTERPRET) {
      if (!interpretIdByUdalost.has(udalostId)) interpretIdByUdalost.set(udalostId, new Set());
      interpretIdByUdalost.get(udalostId)!.add(druhaStranaId);
    }
  }

  const vsechnaInterpretId = [...new Set([...interpretIdByUdalost.values()].flatMap((s) => [...s]))];
  const interpreti = vsechnaInterpretId.length
    ? await prisma.interpret.findMany({ where: { id: { in: vsechnaInterpretId } }, select: { id: true, nazev: true } })
    : [];
  const nazevInterpretaById = new Map(interpreti.map((i) => [i.id, i.nazev]));

  return udalosti.map((u) => ({
    id: u.id,
    nazev: u.nazev,
    datum: u.datum,
    denMesic: denMesicZData(u.datum),
    typ: u.typ,
    stav: u.stav,
    pocetZdroju: pocetZdrojuByUdalost.get(u.id) ?? 0,
    pocetVazeb: pocetVazebByUdalost.get(u.id) ?? 0,
    interpretNazvy: [...(interpretIdByUdalost.get(u.id) ?? [])].map((id) => nazevInterpretaById.get(id) ?? id),
    createdAt: u.createdAt,
  }));
}

interface PodezrelyPar {
  a: UdalostRow;
  b: UdalostRow;
  skore: number;
  duvod: string;
}

function najdiPodezreleParTexty(udalosti: UdalostRow[]): PodezrelyPar[] {
  const vysledky: PodezrelyPar[] = [];
  for (let i = 0; i < udalosti.length; i++) {
    for (let j = i + 1; j < udalosti.length; j++) {
      const a = udalosti[i];
      const b = udalosti[j];
      if (a.denMesic !== b.denMesic) continue;

      const stejnyInterpret =
        a.interpretNazvy.length > 0 && b.interpretNazvy.length > 0 &&
        a.interpretNazvy.some((n) => b.interpretNazvy.includes(n));

      const skoreText = podobnost(normalizuj(a.nazev), normalizuj(b.nazev));

      if (stejnyInterpret && (a.typ === b.typ || skoreText >= 0.5)) {
        vysledky.push({ a, b, skore: skoreText, duvod: "stejný interpret + stejný den" + (a.typ === b.typ ? " + stejný typ" : "") });
      } else if (skoreText >= 0.7) {
        vysledky.push({ a, b, skore: skoreText, duvod: `podobný název (${Math.round(skoreText * 100)} %) + stejný den` });
      }
    }
  }
  return vysledky.sort((x, y) => y.skore - x.skore);
}

const VAHA_STAVU: Record<string, number> = { schvaleno: 3, overeno: 2, navrh: 1 };

function doporucKanonicky(a: UdalostRow, b: UdalostRow): UdalostRow {
  const vahaA = VAHA_STAVU[a.stav] ?? 0;
  const vahaB = VAHA_STAVU[b.stav] ?? 0;
  if (vahaA !== vahaB) return vahaA > vahaB ? a : b;
  if (a.pocetZdroju !== b.pocetZdroju) return a.pocetZdroju > b.pocetZdroju ? a : b;
  if (a.pocetVazeb !== b.pocetVazeb) return a.pocetVazeb > b.pocetVazeb ? a : b;
  if (a.nazev.length !== b.nazev.length) return a.nazev.length > b.nazev.length ? a : b;
  return a.createdAt < b.createdAt ? a : b;
}

// ---------- sloučení jednoho páru ----------

async function slouc(kanonicky: UdalostRow, druhy: UdalostRow) {
  // 1) přesunout Zdroje z druhého na kanonický
  const presunZdroju = await prisma.zdroj.updateMany({
    where: { cilovyTyp: TYP_UDALOST, cilovyId: druhy.id },
    data: { cilovyId: kanonicky.id },
  });

  // 2) přesunout Vazby z druhého na kanonický (na obou stranách vazby)
  const presunVazebZdroj = await prisma.vazba.updateMany({
    where: { zdrojovyTyp: TYP_UDALOST, zdrojovyId: druhy.id },
    data: { zdrojovyId: kanonicky.id },
  });
  const presunVazebCil = await prisma.vazba.updateMany({
    where: { cilovyTyp: TYP_UDALOST, cilovyId: druhy.id },
    data: { cilovyId: kanonicky.id },
  });

  // 3) smazat duplicitní Událost
  await prisma.udalost.delete({ where: { id: druhy.id } });

  return {
    presunutoZdroju: presunZdroju.count,
    presunutoVazeb: presunVazebZdroj.count + presunVazebCil.count,
  };
}

// ---------- hlavní běh ----------

async function main() {
  console.log(PROVEST ? "REŽIM: PROVÉST (skutečně mění databázi)\n" : "REŽIM: DRY-RUN (nic se nezmění, jen náhled)\n");

  const udalosti = await nacistUdalosti();
  const podezrele = najdiPodezreleParTexty(udalosti);

  if (podezrele.length === 0) {
    console.log("Žádné podezřelé duplicity nenalezeny.");
    return;
  }

  console.log(`Nalezeno ${podezrele.length} párů.\n`);
  console.log("=".repeat(80));

  let sloucenoCelkem = 0;

  for (const par of podezrele) {
    const kanonicky = doporucKanonicky(par.a, par.b);
    const druhy = kanonicky.id === par.a.id ? par.b : par.a;

    console.log(`\nDůvod: ${par.duvod}`);
    console.log(`  PONECHAT [${kanonicky.id}] "${kanonicky.nazev}" (${kanonicky.datum}, stav: ${kanonicky.stav})`);
    console.log(`  SMAZAT   [${druhy.id}] "${druhy.nazev}" (${druhy.datum}, stav: ${druhy.stav}, zdroje: ${druhy.pocetZdroju}, vazby: ${druhy.pocetVazeb})`);

    if (PROVEST) {
      const vysledek = await slouc(kanonicky, druhy);
      console.log(`  → sloučeno (přesunuto ${vysledek.presunutoZdroju} zdrojů, ${vysledek.presunutoVazeb} vazeb, duplicita smazána)`);
      sloucenoCelkem++;
    } else {
      console.log(`  → (dry-run, nic neprovedeno)`);
    }
  }

  console.log("\n" + "=".repeat(80));
  if (PROVEST) {
    console.log(`\nHotovo. Sloučeno ${sloucenoCelkem} párů.`);
  } else {
    console.log(`\nToto byl náhled. Pro skutečné sloučení spusť:`);
    console.log(`  npx tsx prisma/merge-duplicity-udalosti.ts --provest`);
  }
}

main()
  .catch((e) => {
    console.error("Chyba při běhu skriptu:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

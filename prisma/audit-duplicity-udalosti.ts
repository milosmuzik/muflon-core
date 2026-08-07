/**
 * Audit skript: hledá podezřelé duplicity v tabulce Události.
 *
 * READ-ONLY — nic nemaže ani neupravuje, jen vypíše seznam podezřelých párů
 * k ruční kontrole.
 *
 *   npx tsx prisma/audit-duplicity-udalosti.ts
 *
 * Vychází ze skutečného schema.prisma:
 * - Udalost.datum je String "YYYY-MM-DD" nebo "MM-DD" (výročí bez roku)
 * - Zdroj a Vazba jsou polymorfní přes (typ, id) stringy, ne Prisma relace
 *   -> propojení se dohledává ručně přes zdrojovyTyp/zdrojovyId/cilovyTyp/cilovyId
 * - Udalost.stav: "navrh" | "overeno" | "schvaleno" (podle default("navrh"))
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TYP_UDALOST = "Udalost";
const TYP_INTERPRET = "Interpret";

interface UdalostRow {
  id: string;
  nazev: string;
  datum: string; // "YYYY-MM-DD" nebo "MM-DD"
  denMesic: string; // vždy "MM-DD", pro porovnání výročí
  typ: string;
  stav: string;
  pocetZdroju: number;
  pocetVazeb: number;
  interpretNazvy: string[]; // přes Vazba, obvykle 0-1 položka
  createdAt: Date;
}

// ---------- 1. Normalizace + parsování data ----------

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
  // "1994-08-30" -> "08-30" ; "08-30" -> "08-30"
  const casti = datum.split("-");
  if (casti.length === 3) return `${casti[1]}-${casti[2]}`;
  if (casti.length === 2) return datum;
  return datum; // neznámý formát, porovná se doslovně
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

// ---------- 2. Načtení dat (ruční JOIN přes polymorfní Zdroj/Vazba) ----------

async function nacistUdalosti(): Promise<UdalostRow[]> {
  const [udalosti, zdroje, vazby] = await Promise.all([
    prisma.udalost.findMany({
      select: { id: true, nazev: true, datum: true, typ: true, stav: true, createdAt: true },
    }),
    prisma.zdroj.findMany({
      where: { cilovyTyp: TYP_UDALOST },
      select: { cilovyId: true },
    }),
    prisma.vazba.findMany({
      where: {
        OR: [
          { zdrojovyTyp: TYP_UDALOST },
          { cilovyTyp: TYP_UDALOST },
        ],
      },
      select: { zdrojovyTyp: true, zdrojovyId: true, cilovyTyp: true, cilovyId: true },
    }),
  ]);

  const pocetZdrojuByUdalost = new Map<string, number>();
  for (const z of zdroje) {
    pocetZdrojuByUdalost.set(z.cilovyId, (pocetZdrojuByUdalost.get(z.cilovyId) ?? 0) + 1);
  }

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
    ? await prisma.interpret.findMany({
        where: { id: { in: vsechnaInterpretId } },
        select: { id: true, nazev: true },
      })
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
    interpretNazvy: [...(interpretIdByUdalost.get(u.id) ?? [])].map(
      (id) => nazevInterpretaById.get(id) ?? id
    ),
    createdAt: u.createdAt,
  }));
}

// ---------- 3. Skupinové porovnání ----------

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
        a.interpretNazvy.length > 0 &&
        b.interpretNazvy.length > 0 &&
        a.interpretNazvy.some((n) => b.interpretNazvy.includes(n));

      const naA = normalizuj(a.nazev);
      const naB = normalizuj(b.nazev);
      const skoreText = podobnost(naA, naB);

      if (stejnyInterpret && (a.typ === b.typ || skoreText >= 0.5)) {
        vysledky.push({
          a,
          b,
          skore: skoreText,
          duvod: "stejný interpret + stejný den" + (a.typ === b.typ ? " + stejný typ" : ""),
        });
      } else if (skoreText >= 0.7) {
        vysledky.push({
          a,
          b,
          skore: skoreText,
          duvod: `podobný název (${Math.round(skoreText * 100)} %) + stejný den`,
        });
      }
    }
  }

  return vysledky.sort((x, y) => y.skore - x.skore);
}

// ---------- 4. Doporučení, který záznam ponechat ----------

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

// ---------- 5. Hlavní běh ----------

async function main() {
  console.log("Načítám události z databáze...");
  const udalosti = await nacistUdalosti();
  console.log(`Načteno ${udalosti.length} událostí.\n`);

  const podezrele = najdiPodezreleParTexty(udalosti);

  if (podezrele.length === 0) {
    console.log("Žádné podezřelé duplicity nenalezeny.");
    return;
  }

  console.log(`Nalezeno ${podezrele.length} podezřelých párů:\n`);
  console.log("=".repeat(80));

  for (const par of podezrele) {
    const kanonicky = doporucKanonicky(par.a, par.b);
    const druhy = kanonicky.id === par.a.id ? par.b : par.a;

    console.log(`\nDůvod: ${par.duvod}`);
    for (const u of [par.a, par.b]) {
      console.log(
        `  [${u.id}] "${u.nazev}" (${u.datum}, typ: ${u.typ}, stav: ${u.stav}, ` +
          `interpret: ${u.interpretNazvy.join(", ") || "?"}, zdroje: ${u.pocetZdroju}, vazby: ${u.pocetVazeb})`
      );
    }
    console.log(`  → doporučuji ponechat: [${kanonicky.id}], smazat/sloučit: [${druhy.id}]`);
  }

  console.log("\n" + "=".repeat(80));
  console.log(`\nCelkem ${podezrele.length} párů k ruční kontrole. Nic nebylo smazáno.`);
}

main()
  .catch((e) => {
    console.error("Chyba při běhu skriptu:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * Merge skript v4: sloučí shluky duplicitních Událostí se STEJNÝM datem.
 * Shluky s rozdílem 1 den (⚠️ POZOR RŮZNÉ DNY) se NIKDY neslučují
 * automaticky — jen se vypíšou, protože rozhodnutí, které datum je
 * správné, je věcné a musí ho udělat člověk. Po rozhodnutí uprav datum
 * ručně na webu/v databázi a spusť skript znovu — pak už půjde o shluk
 * se stejným dnem a sloučí se normálně.
 *
 * VÝCHOZÍ REŽIM = DRY-RUN.
 *   npx tsx prisma/merge-duplicity-udalosti.ts
 *
 * Skutečné provedení (jen shluky se stejným dnem):
 *   npx tsx prisma/merge-duplicity-udalosti.ts --provest
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
  denCislo: number;
  typ: string;
  stav: string;
  pocetZdroju: number;
  pocetVazeb: number;
  interpretNazvy: string[];
  entitaSubstring: string | null;
  createdAt: Date;
}

const STOPWORDA = [
  "vydani", "vydal", "vydali", "album", "alba", "od", "kapely", "kapela",
  "narozeni", "narozeniny", "umrti", "zemrel", "zemrela", "legendarniho",
  "legendarni", "debutove", "debutoveho", "debut", "zalozeni", "zalozili",
  "the", "a", "posledni", "koncert", "varianta", "verze",
];

const DNY_V_MESICI = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function odstranDiakritiku(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizuj(text: string): string[] {
  return odstranDiakritiku(text.toLowerCase())
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((slovo) => slovo && !STOPWORDA.includes(slovo));
}

function trigramyTokenu(tok: string): string[] {
  if (tok.length <= 3) return [tok];
  const grams: string[] = [];
  for (let i = 0; i <= tok.length - 3; i++) grams.push(tok.slice(i, i + 3));
  return grams;
}

function trigramySady(tokeny: string[]): Set<string> {
  const grams = new Set<string>();
  for (const tok of tokeny) for (const g of trigramyTokenu(tok)) grams.add(g);
  return grams;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let prunik = 0;
  for (const g of a) if (b.has(g)) prunik++;
  const sjednoceni = a.size + b.size - prunik;
  return prunik / sjednoceni;
}

function podobnostNazvu(a: string, b: string): number {
  return jaccard(trigramySady(normalizuj(a)), trigramySady(normalizuj(b)));
}

function denCisloZData(datum: string): number {
  const casti = datum.split("-");
  let mesic: number, den: number;
  if (casti.length === 3) {
    mesic = parseInt(casti[1], 10);
    den = parseInt(casti[2], 10);
  } else if (casti.length === 2) {
    mesic = parseInt(casti[0], 10);
    den = parseInt(casti[1], 10);
  } else {
    return -1;
  }
  if (!mesic || !den || mesic < 1 || mesic > 12) return -1;
  let soucet = 0;
  for (let i = 0; i < mesic - 1; i++) soucet += DNY_V_MESICI[i];
  return soucet + den;
}

function rozdilDni(a: number, b: number): number {
  if (a < 0 || b < 0) return 999;
  const rozdil = Math.abs(a - b);
  return Math.min(rozdil, 365 - rozdil);
}

async function nacistUdalosti(): Promise<UdalostRow[]> {
  const [udalosti, zdroje, vazby, interpreti, hudebnici] = await Promise.all([
    prisma.udalost.findMany({
      select: { id: true, nazev: true, datum: true, typ: true, stav: true, createdAt: true },
    }),
    prisma.zdroj.findMany({ where: { cilovyTyp: TYP_UDALOST }, select: { cilovyId: true } }),
    prisma.vazba.findMany({
      where: { OR: [{ zdrojovyTyp: TYP_UDALOST }, { cilovyTyp: TYP_UDALOST }] },
      select: { zdrojovyTyp: true, zdrojovyId: true, cilovyTyp: true, cilovyId: true },
    }),
    prisma.interpret.findMany({ select: { id: true, nazev: true } }),
    prisma.hudebnik.findMany({ select: { id: true, jmeno: true } }),
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

  const nazevInterpretaById = new Map(interpreti.map((i) => [i.id, i.nazev]));

  const entity = [
    ...interpreti.map((i) => ({ nazev: i.nazev, norm: odstranDiakritiku(i.nazev.toLowerCase()) })),
    ...hudebnici.map((h) => ({ nazev: h.jmeno, norm: odstranDiakritiku(h.jmeno.toLowerCase()) })),
  ]
    .filter((e) => e.norm.length >= 4)
    .sort((a, b) => b.norm.length - a.norm.length);

  function najdiEntituVTextu(nazev: string): string | null {
    const norm = odstranDiakritiku(nazev.toLowerCase());
    for (const e of entity) {
      if (norm.includes(e.norm)) return e.nazev;
    }
    return null;
  }

  return udalosti.map((u) => ({
    id: u.id,
    nazev: u.nazev,
    datum: u.datum,
    denCislo: denCisloZData(u.datum),
    typ: u.typ,
    stav: u.stav,
    pocetZdroju: pocetZdrojuByUdalost.get(u.id) ?? 0,
    pocetVazeb: pocetVazebByUdalost.get(u.id) ?? 0,
    interpretNazvy: [...(interpretIdByUdalost.get(u.id) ?? [])].map((id) => nazevInterpretaById.get(id) ?? id),
    entitaSubstring: najdiEntituVTextu(u.nazev),
    createdAt: u.createdAt,
  }));
}

const PRAH_STEJNA_ENTITA = 0.35;
const PRAH_JEN_TEXT = 0.45;
const PRAH_SOUSEDNI_DEN_ENTITA = 0.5;
const PRAH_SOUSEDNI_DEN_TEXT = 0.65;

function jeDuplicita(a: UdalostRow, b: UdalostRow): { je: boolean; skore: number; duvod: string; ruzneDatumy: boolean } {
  const rozdil = rozdilDni(a.denCislo, b.denCislo);
  if (rozdil > 1) return { je: false, skore: 0, duvod: "", ruzneDatumy: false };

  const entitaA = a.entitaSubstring ?? a.interpretNazvy[0] ?? null;
  const entitaB = b.entitaSubstring ?? b.interpretNazvy[0] ?? null;
  const stejnaEntita = entitaA !== null && entitaA === entitaB;

  const skore = podobnostNazvu(a.nazev, b.nazev);

  if (rozdil === 0) {
    if (stejnaEntita && skore >= PRAH_STEJNA_ENTITA) {
      return { je: true, skore, duvod: `stejná entita (${entitaA}) + stejný den, podobnost textu ${Math.round(skore * 100)} %`, ruzneDatumy: false };
    }
    if (skore >= PRAH_JEN_TEXT) {
      return { je: true, skore, duvod: `podobný text (${Math.round(skore * 100)} %) + stejný den`, ruzneDatumy: false };
    }
  } else {
    if (stejnaEntita && skore >= PRAH_SOUSEDNI_DEN_ENTITA) {
      return { je: true, skore, duvod: `POZOR RŮZNÉ DNY (${a.datum} vs ${b.datum}) — stejná entita (${entitaA}), podobnost textu ${Math.round(skore * 100)} %`, ruzneDatumy: true };
    }
    if (skore >= PRAH_SOUSEDNI_DEN_TEXT) {
      return { je: true, skore, duvod: `POZOR RŮZNÉ DNY (${a.datum} vs ${b.datum}) — podobný text (${Math.round(skore * 100)} %)`, ruzneDatumy: true };
    }
  }
  return { je: false, skore, duvod: "", ruzneDatumy: false };
}

class UnionFind {
  rodic: number[];
  constructor(n: number) {
    this.rodic = Array.from({ length: n }, (_, i) => i);
  }
  najdi(x: number): number {
    if (this.rodic[x] !== x) this.rodic[x] = this.najdi(this.rodic[x]);
    return this.rodic[x];
  }
  spoj(x: number, y: number) {
    const rx = this.najdi(x);
    const ry = this.najdi(y);
    if (rx !== ry) this.rodic[rx] = ry;
  }
}

interface Shluk {
  udalosti: UdalostRow[];
  nejlepsiSkore: number;
  duvody: string[];
  maRuzneDatumy: boolean;
}

function najdiShluky(udalosti: UdalostRow[]): Shluk[] {
  const uf = new UnionFind(udalosti.length);
  const duvodyPairs: Record<string, string[]> = {};
  const skorePairs: Record<string, number> = {};
  const ruzneDatumyPairs: Record<string, boolean> = {};

  for (let i = 0; i < udalosti.length; i++) {
    for (let j = i + 1; j < udalosti.length; j++) {
      const vysledek = jeDuplicita(udalosti[i], udalosti[j]);
      if (vysledek.je) {
        uf.spoj(i, j);
        const koren = uf.najdi(i);
        if (!duvodyPairs[koren]) duvodyPairs[koren] = [];
        duvodyPairs[koren].push(vysledek.duvod);
        skorePairs[koren] = Math.max(skorePairs[koren] ?? 0, vysledek.skore);
        if (vysledek.ruzneDatumy) ruzneDatumyPairs[koren] = true;
      }
    }
  }

  const skupiny = new Map<number, number[]>();
  for (let i = 0; i < udalosti.length; i++) {
    const koren = uf.najdi(i);
    if (!skupiny.has(koren)) skupiny.set(koren, []);
    skupiny.get(koren)!.push(i);
  }

  const shluky: Shluk[] = [];
  for (const [koren, indexy] of skupiny) {
    if (indexy.length < 2) continue;
    shluky.push({
      udalosti: indexy.map((i) => udalosti[i]),
      nejlepsiSkore: skorePairs[koren] ?? 0,
      duvody: [...new Set(duvodyPairs[koren] ?? [])],
      maRuzneDatumy: ruzneDatumyPairs[koren] === true,
    });
  }

  return shluky.sort((a, b) => {
    if (a.maRuzneDatumy !== b.maRuzneDatumy) return a.maRuzneDatumy ? -1 : 1;
    return b.nejlepsiSkore - a.nejlepsiSkore;
  });
}

const VAHA_STAVU: Record<string, number> = { schvaleno: 3, overeno: 2, navrh: 1 };

function serazeniKvalityDesc(udalosti: UdalostRow[]): UdalostRow[] {
  return [...udalosti].sort((a, b) => {
    const vahaA = VAHA_STAVU[a.stav] ?? 0;
    const vahaB = VAHA_STAVU[b.stav] ?? 0;
    if (vahaA !== vahaB) return vahaB - vahaA;
    if (a.pocetZdroju !== b.pocetZdroju) return b.pocetZdroju - a.pocetZdroju;
    if (a.pocetVazeb !== b.pocetVazeb) return b.pocetVazeb - a.pocetVazeb;
    if (a.nazev.length !== b.nazev.length) return b.nazev.length - a.nazev.length;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
}

async function slouc(kanonicky: UdalostRow, druhy: UdalostRow) {
  const presunZdroju = await prisma.zdroj.updateMany({
    where: { cilovyTyp: TYP_UDALOST, cilovyId: druhy.id },
    data: { cilovyId: kanonicky.id },
  });
  const presunVazebZdroj = await prisma.vazba.updateMany({
    where: { zdrojovyTyp: TYP_UDALOST, zdrojovyId: druhy.id },
    data: { zdrojovyId: kanonicky.id },
  });
  const presunVazebCil = await prisma.vazba.updateMany({
    where: { cilovyTyp: TYP_UDALOST, cilovyId: druhy.id },
    data: { cilovyId: kanonicky.id },
  });
  await prisma.udalost.delete({ where: { id: druhy.id } });

  return {
    presunutoZdroju: presunZdroju.count,
    presunutoVazeb: presunVazebZdroj.count + presunVazebCil.count,
  };
}

async function main() {
  console.log(PROVEST ? "REŽIM: PROVÉST (mění databázi — jen shluky se STEJNÝM datem)\n" : "REŽIM: DRY-RUN (nic se nezmění, jen náhled)\n");

  const udalosti = await nacistUdalosti();
  const shluky = najdiShluky(udalosti);

  if (shluky.length === 0) {
    console.log("Žádné podezřelé duplicity nenalezeny.");
    return;
  }

  console.log(`Nalezeno ${shluky.length} shluků.\n`);
  console.log("=".repeat(80));

  let sloucenoZaznamu = 0;
  let preskocenoKvuliDatumu = 0;

  for (const shluk of shluky) {
    const serazene = serazeniKvalityDesc(shluk.udalosti);
    const kanonicky = serazene[0];
    const duplicity = serazene.slice(1);

    console.log(`\n${shluk.maRuzneDatumy ? "⚠️  " : ""}Důvod: ${shluk.duvody.join("; ")}`);
    console.log(`  PONECHAT [${kanonicky.id}] "${kanonicky.nazev}" (${kanonicky.datum}, stav: ${kanonicky.stav})`);

    if (shluk.maRuzneDatumy) {
      for (const d of duplicity) {
        console.log(`  NALEZENO [${d.id}] "${d.nazev}" (${d.datum}, stav: ${d.stav}, zdroje: ${d.pocetZdroju}, vazby: ${d.pocetVazeb})`);
      }
      console.log(`  → PŘESKOČENO — data se liší, rozhodni ručně, které datum je správné, pak spusť znovu`);
      preskocenoKvuliDatumu += duplicity.length;
      continue;
    }

    for (const d of duplicity) {
      console.log(`  SMAZAT   [${d.id}] "${d.nazev}" (${d.datum}, stav: ${d.stav}, zdroje: ${d.pocetZdroju}, vazby: ${d.pocetVazeb})`);
      if (PROVEST) {
        const vysledek = await slouc(kanonicky, d);
        console.log(`    → sloučeno (přesunuto ${vysledek.presunutoZdroju} zdrojů, ${vysledek.presunutoVazeb} vazeb)`);
        sloucenoZaznamu++;
      }
    }
    if (!PROVEST) console.log(`  → (dry-run, nic neprovedeno)`);
  }

  console.log("\n" + "=".repeat(80));
  if (PROVEST) {
    console.log(`\nHotovo. Smazáno ${sloucenoZaznamu} duplicitních záznamů.`);
    if (preskocenoKvuliDatumu > 0) console.log(`Přeskočeno ${preskocenoKvuliDatumu} záznamů kvůli rozdílnému datu — potřebují ruční rozhodnutí.`);
  } else {
    console.log(`\nToto byl náhled. Pro skutečné sloučení (jen shluky se stejným dnem) spusť:`);
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

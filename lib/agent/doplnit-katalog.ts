import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { nazevZeZdroje, POZNAMKA_AI_ROZSIRENI, urovenDuveryZeZdroje } from "@/lib/constants";
import { rozbalRedirect } from "@/lib/agent/redirect";
import { GeminiQuotaError, geminiJeDostupne, jeKvotaChyba, vytahniJson, zavolejGemini } from "@/lib/agent/gemini";
import {
  faktaZMusicBrainzAlbum,
  faktaZMusicBrainzHudebnik,
  najdiAlbaNaMetalArchives,
  najdiHudebnikaNaMetalArchives,
} from "@/lib/agent/databaze";
import { type RozpocetCasu, VYCHOZI_ROZPOCET_MS, vytvorRozpocet } from "@/lib/agent/rozpocet-casu";

export type RadekDoplneni = {
  typ: "Hudebnik" | "Album";
  id: string;
  nazev: string;
  href: string;
  zmeny: string[];
  zdroje: string[];
};

export type VysledekDoplneni = {
  zpracovano: number;
  doplneno: number;
  zdroje: number;
  polozky: RadekDoplneni[];
  chyby: string[];
};

type Nalez = {
  pseudonymy?: string | null;
  datumNarozeni?: string | null;
  datumUmrti?: string | null;
  datumVydani?: string | null;
  vydavatel?: string | null;
  poznamka?: string | null;
  zdroje?: { nazev: string; url: string; kategorie: string }[];
};

const pauza = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function zeptatSeGemini(prompt: string, rozpocet: RozpocetCasu): Promise<Nalez> {
  if (!geminiJeDostupne()) throw new GeminiQuotaError();
  const text = await zavolejGemini(prompt, { hledat: true, maxVystup: 500 }, rozpocet);
  const parsed = vytahniJson(text);
  return parsed && typeof parsed === "object" ? (parsed as Nalez) : {};
}

async function ulozZdroje(
  typ: string,
  id: string,
  zdroje: Nalez["zdroje"],
  rozpocet: RozpocetCasu
): Promise<string[]> {
  const pridane: string[] = [];
  for (const z of zdroje || []) {
    if (!z?.url || !z?.nazev) continue;
    const url = await rozbalRedirect(String(z.url), rozpocet);
    const existuje = await prisma.zdroj.findFirst({
      where: { cilovyTyp: typ, cilovyId: id, OR: [{ url }, { nazev: z.nazev }] },
    });
    if (existuje) continue;
    const kategorie = z.kategorie || "orientacni";
    const nazev = nazevZeZdroje(url, z.nazev);
    await prisma.zdroj.create({
      data: {
        cilovyTyp: typ,
        cilovyId: id,
        nazev,
        url,
        kategorie,
        uroverDuvery: urovenDuveryZeZdroje(kategorie, url),
        poznamka: POZNAMKA_AI_ROZSIRENI,
      },
    });
    pridane.push(url ? `${nazev} (${url})` : nazev);
  }
  return pridane;
}

function slucZdroje(...skupiny: (Nalez["zdroje"] | undefined)[]): Nalez["zdroje"] {
  const mapa = new Map<string, { nazev: string; url: string; kategorie: string }>();
  for (const skupina of skupiny) {
    for (const z of skupina || []) {
      if (z?.url) mapa.set(z.url, z);
    }
  }
  return [...mapa.values()];
}

export async function doplnitHudebnika(
  id: string,
  rozpocet: RozpocetCasu = vytvorRozpocet(VYCHOZI_ROZPOCET_MS)
): Promise<RadekDoplneni> {
  const prazdny: RadekDoplneni = {
    typ: "Hudebnik",
    id,
    nazev: "",
    href: `/hudebnici/${id}`,
    zmeny: [],
    zdroje: [],
  };
  const h = await prisma.hudebnik.findUnique({
    where: { id },
    include: { clenstvi: { include: { interpret: true } } },
  });
  if (!h) return prazdny;

  const kapely = h.clenstvi.map((c) => c.interpret.nazev);
  const nalez: Nalez = {};

  const ma = await najdiHudebnikaNaMetalArchives(h.jmeno, kapely[0] ?? null, rozpocet);
  if (ma) nalez.zdroje = slucZdroje(nalez.zdroje, [ma.zdroj]);
  await pauza(400);

  const mb = await faktaZMusicBrainzHudebnik(h.jmeno, rozpocet);
  if (mb) {
    if (mb.datumNarozeni) nalez.datumNarozeni = mb.datumNarozeni;
    if (mb.datumUmrti) nalez.datumUmrti = mb.datumUmrti;
    if (mb.zdroj) nalez.zdroje = slucZdroje(nalez.zdroje, [mb.zdroj]);
  }
  await pauza(1100);

  const chybiFakta =
    (!h.datumNarozeni && !nalez.datumNarozeni) ||
    (!h.datumUmrti && !nalez.datumUmrti && Boolean(h.datumNarozeni || nalez.datumNarozeni) === false) ||
    (!h.pseudonymy && !nalez.pseudonymy && !h.datumNarozeni && !nalez.datumNarozeni);
  if (chybiFakta && geminiJeDostupne() && !rozpocet.vyprsel()) {
    try {
      const zGemini = await zeptatSeGemini(
        `Hudebník: "${h.jmeno}". Kapely: ${kapely.join(", ") || "neznámé"}. Známé: narození=${h.datumNarozeni ?? nalez.datumNarozeni ?? "?"}, úmrtí=${h.datumUmrti ?? nalez.datumUmrti ?? "?"}, pseudonymy=${h.pseudonymy ?? "?"}.
Najdi chybějící fakta (narození/úmrtí, pseudonymy) a ověřitelné URL. Poznámku piš jen když je krátká a ověřená.
Vrať POUZE JSON: {"pseudonymy":null,"datumNarozeni":null,"datumUmrti":null,"poznamka":null,"zdroje":[{"nazev":"","url":"https://","kategorie":"oficialni_web|socialni_site|databaze|media|orientacni"}]}`,
        rozpocet
      );
      if (!nalez.datumNarozeni && zGemini.datumNarozeni) nalez.datumNarozeni = zGemini.datumNarozeni;
      if (!nalez.datumUmrti && zGemini.datumUmrti) nalez.datumUmrti = zGemini.datumUmrti;
      if (zGemini.pseudonymy) nalez.pseudonymy = zGemini.pseudonymy;
      if (zGemini.poznamka) nalez.poznamka = zGemini.poznamka;
      nalez.zdroje = slucZdroje(nalez.zdroje, zGemini.zdroje);
    } catch (e) {
      if (!jeKvotaChyba(e)) throw e;
    }
  }

  const data: Record<string, string> = {};
  const zmeny: string[] = [];
  if (!h.pseudonymy && nalez.pseudonymy) {
    data.pseudonymy = String(nalez.pseudonymy);
    zmeny.push(`pseudonymy: ${data.pseudonymy}`);
  }
  if (!h.datumNarozeni && nalez.datumNarozeni) {
    data.datumNarozeni = String(nalez.datumNarozeni);
    zmeny.push(`narození: ${data.datumNarozeni}`);
  }
  if (!h.datumUmrti && nalez.datumUmrti) {
    data.datumUmrti = String(nalez.datumUmrti);
    zmeny.push(`úmrtí: ${data.datumUmrti}`);
  }
  if (!h.poznamka && nalez.poznamka) {
    data.poznamka = String(nalez.poznamka);
    zmeny.push(`poznámka: ${data.poznamka}`);
  }

  if (Object.keys(data).length) await prisma.hudebnik.update({ where: { id }, data });
  const zdroje = await ulozZdroje("Hudebnik", id, nalez.zdroje, rozpocet);
  if (zmeny.length || zdroje.length) {
    await zapisHistorii("Hudebnik", id, "upraveno", `Doplněno: ${[...zmeny, ...zdroje].join("; ")}`);
  }
  return { typ: "Hudebnik", id, nazev: h.jmeno, href: `/hudebnici/${id}`, zmeny, zdroje };
}

export async function doplnitAlbum(
  id: string,
  rozpocet: RozpocetCasu = vytvorRozpocet(VYCHOZI_ROZPOCET_MS)
): Promise<RadekDoplneni> {
  const prazdny: RadekDoplneni = {
    typ: "Album",
    id,
    nazev: "",
    href: `/alba/${id}`,
    zmeny: [],
    zdroje: [],
  };
  const a = await prisma.album.findUnique({
    where: { id },
    include: { interpreti: { include: { interpret: true } } },
  });
  if (!a) return prazdny;

  const kapely = a.interpreti.map((i) => i.interpret.nazev);
  const nalez: Nalez = {};

  const ma = await najdiAlbaNaMetalArchives(a.nazev, kapely[0] ?? null, rozpocet);
  if (ma) {
    if (ma.datumVydani) nalez.datumVydani = ma.datumVydani;
    nalez.zdroje = slucZdroje(nalez.zdroje, [ma.zdroj]);
  }
  await pauza(400);

  const mb = await faktaZMusicBrainzAlbum(a.nazev, kapely[0] ?? null, rozpocet);
  if (mb) {
    if (!nalez.datumVydani && mb.datumVydani) nalez.datumVydani = mb.datumVydani;
    if (mb.vydavatel) nalez.vydavatel = mb.vydavatel;
    if (mb.zdroj) nalez.zdroje = slucZdroje(nalez.zdroje, [mb.zdroj]);
  }
  await pauza(1100);

  const chybiFakta =
    (!a.datumVydani && !nalez.datumVydani) || (!a.vydavatel && !nalez.vydavatel);
  if (chybiFakta && geminiJeDostupne() && !rozpocet.vyprsel()) {
    try {
      const zGemini = await zeptatSeGemini(
        `Album: "${a.nazev}". Interpret: ${kapely.join(", ") || "neznámý"}. Známé: vydání=${a.datumVydani ?? nalez.datumVydani ?? "?"}, vydavatel=${a.vydavatel ?? nalez.vydavatel ?? "?"}.
Najdi chybějící datum vydání, vydavatele a ověřitelné URL. Poznámku piš jen když je krátká a ověřená.
Vrať POUZE JSON: {"datumVydani":null,"vydavatel":null,"poznamka":null,"zdroje":[{"nazev":"","url":"https://","kategorie":"oficialni_web|socialni_site|databaze|media|orientacni"}]}`,
        rozpocet
      );
      if (!nalez.datumVydani && zGemini.datumVydani) nalez.datumVydani = zGemini.datumVydani;
      if (!nalez.vydavatel && zGemini.vydavatel) nalez.vydavatel = zGemini.vydavatel;
      if (zGemini.poznamka) nalez.poznamka = zGemini.poznamka;
      nalez.zdroje = slucZdroje(nalez.zdroje, zGemini.zdroje);
    } catch (e) {
      if (!jeKvotaChyba(e)) throw e;
    }
  }

  const data: Record<string, string> = {};
  const zmeny: string[] = [];
  if (!a.datumVydani && nalez.datumVydani) {
    data.datumVydani = String(nalez.datumVydani);
    zmeny.push(`vydání: ${data.datumVydani}`);
  }
  if (!a.vydavatel && nalez.vydavatel) {
    data.vydavatel = String(nalez.vydavatel);
    zmeny.push(`vydavatel: ${data.vydavatel}`);
  }
  if (!a.poznamka && nalez.poznamka) {
    data.poznamka = String(nalez.poznamka);
    zmeny.push(`poznámka: ${data.poznamka}`);
  }

  if (Object.keys(data).length) await prisma.album.update({ where: { id }, data });
  const zdroje = await ulozZdroje("Album", id, nalez.zdroje, rozpocet);
  if (zmeny.length || zdroje.length) {
    await zapisHistorii("Album", id, "upraveno", `Doplněno: ${[...zmeny, ...zdroje].join("; ")}`);
  }
  return { typ: "Album", id, nazev: a.nazev, href: `/alba/${id}`, zmeny, zdroje };
}

// ---------------------------------------------------------------------------
// Dávková varianta pro doplnitKatalogDavku: volné zdroje (Metal Archives,
// MusicBrainz) se pořád zjišťují po jedné kartě (jsou zdarma), ale Gemini
// fallback se pro všechny karty, které ho ještě potřebují, pošle v JEDNOM
// groundovaném promptu místo 1 volání na kartu.
//
// Časový rozpočet (rozpocet) se předává do KAŽDÉHO síťového volání a navíc
// se kontroluje MEZI položkami/fázemi (viz doplnitKatalogDavku níže) – ať
// se nezačíná další položka/dávka, na kterou stejně nezbyde čas. Cokoliv se
// v rámci dostupného času stihne zjistit, se na konci VŽDY uloží (uložení
// jsou jen rychlé DB zápisy, ne další síťová volání) – žádná dřívější
// práce se timeoutem nezahazuje.
// ---------------------------------------------------------------------------

type PripravaHudebnika = {
  id: string;
  jmeno: string;
  kapely: string[];
  puvodni: { datumNarozeni: string | null; datumUmrti: string | null; pseudonymy: string | null };
  nalez: Nalez;
  potrebujeGemini: boolean;
};

async function pripravitVolneZdrojeHudebnika(id: string, rozpocet: RozpocetCasu): Promise<PripravaHudebnika | null> {
  const h = await prisma.hudebnik.findUnique({ where: { id }, include: { clenstvi: { include: { interpret: true } } } });
  if (!h) return null;
  const kapely = h.clenstvi.map((c) => c.interpret.nazev);
  const nalez: Nalez = {};

  const ma = await najdiHudebnikaNaMetalArchives(h.jmeno, kapely[0] ?? null, rozpocet);
  if (ma) nalez.zdroje = slucZdroje(nalez.zdroje, [ma.zdroj]);
  await pauza(400);

  if (!rozpocet.vyprsel()) {
    const mb = await faktaZMusicBrainzHudebnik(h.jmeno, rozpocet);
    if (mb) {
      if (mb.datumNarozeni) nalez.datumNarozeni = mb.datumNarozeni;
      if (mb.datumUmrti) nalez.datumUmrti = mb.datumUmrti;
      if (mb.zdroj) nalez.zdroje = slucZdroje(nalez.zdroje, [mb.zdroj]);
    }
    await pauza(1100);
  }

  const potrebujeGemini =
    (!h.datumNarozeni && !nalez.datumNarozeni) ||
    (!h.datumUmrti && !nalez.datumUmrti && Boolean(h.datumNarozeni || nalez.datumNarozeni) === false) ||
    (!h.pseudonymy && !nalez.pseudonymy && !h.datumNarozeni && !nalez.datumNarozeni);

  return {
    id: h.id,
    jmeno: h.jmeno,
    kapely,
    puvodni: { datumNarozeni: h.datumNarozeni, datumUmrti: h.datumUmrti, pseudonymy: h.pseudonymy },
    nalez,
    potrebujeGemini,
  };
}

async function ulozitHudebnika(p: PripravaHudebnika, rozpocet: RozpocetCasu): Promise<RadekDoplneni> {
  const data: Record<string, string> = {};
  const zmeny: string[] = [];
  if (!p.puvodni.pseudonymy && p.nalez.pseudonymy) {
    data.pseudonymy = String(p.nalez.pseudonymy);
    zmeny.push(`pseudonymy: ${data.pseudonymy}`);
  }
  if (!p.puvodni.datumNarozeni && p.nalez.datumNarozeni) {
    data.datumNarozeni = String(p.nalez.datumNarozeni);
    zmeny.push(`narození: ${data.datumNarozeni}`);
  }
  if (!p.puvodni.datumUmrti && p.nalez.datumUmrti) {
    data.datumUmrti = String(p.nalez.datumUmrti);
    zmeny.push(`úmrtí: ${data.datumUmrti}`);
  }
  if (p.nalez.poznamka) {
    data.poznamka = String(p.nalez.poznamka);
    zmeny.push(`poznámka: ${data.poznamka}`);
  }
  if (Object.keys(data).length) await prisma.hudebnik.update({ where: { id: p.id }, data });
  const zdroje = await ulozZdroje("Hudebnik", p.id, p.nalez.zdroje, rozpocet);
  if (zmeny.length || zdroje.length) {
    await zapisHistorii("Hudebnik", p.id, "upraveno", `Doplněno: ${[...zmeny, ...zdroje].join("; ")}`);
  }
  return { typ: "Hudebnik", id: p.id, nazev: p.jmeno, href: `/hudebnici/${p.id}`, zmeny, zdroje };
}

type PripravaAlba = {
  id: string;
  nazev: string;
  kapely: string[];
  puvodni: { datumVydani: string | null; vydavatel: string | null };
  nalez: Nalez;
  potrebujeGemini: boolean;
};

async function pripravitVolneZdrojeAlba(id: string, rozpocet: RozpocetCasu): Promise<PripravaAlba | null> {
  const a = await prisma.album.findUnique({ where: { id }, include: { interpreti: { include: { interpret: true } } } });
  if (!a) return null;
  const kapely = a.interpreti.map((i) => i.interpret.nazev);
  const nalez: Nalez = {};

  const ma = await najdiAlbaNaMetalArchives(a.nazev, kapely[0] ?? null, rozpocet);
  if (ma) {
    if (ma.datumVydani) nalez.datumVydani = ma.datumVydani;
    nalez.zdroje = slucZdroje(nalez.zdroje, [ma.zdroj]);
  }
  await pauza(400);

  if (!rozpocet.vyprsel()) {
    const mb = await faktaZMusicBrainzAlbum(a.nazev, kapely[0] ?? null, rozpocet);
    if (mb) {
      if (!nalez.datumVydani && mb.datumVydani) nalez.datumVydani = mb.datumVydani;
      if (mb.vydavatel) nalez.vydavatel = mb.vydavatel;
      if (mb.zdroj) nalez.zdroje = slucZdroje(nalez.zdroje, [mb.zdroj]);
    }
    await pauza(1100);
  }

  const potrebujeGemini = (!a.datumVydani && !nalez.datumVydani) || (!a.vydavatel && !nalez.vydavatel);

  return {
    id: a.id,
    nazev: a.nazev,
    kapely,
    puvodni: { datumVydani: a.datumVydani, vydavatel: a.vydavatel },
    nalez,
    potrebujeGemini,
  };
}

async function ulozitAlbum(p: PripravaAlba, rozpocet: RozpocetCasu): Promise<RadekDoplneni> {
  const data: Record<string, string> = {};
  const zmeny: string[] = [];
  if (!p.puvodni.datumVydani && p.nalez.datumVydani) {
    data.datumVydani = String(p.nalez.datumVydani);
    zmeny.push(`vydání: ${data.datumVydani}`);
  }
  if (!p.puvodni.vydavatel && p.nalez.vydavatel) {
    data.vydavatel = String(p.nalez.vydavatel);
    zmeny.push(`vydavatel: ${data.vydavatel}`);
  }
  if (p.nalez.poznamka) {
    data.poznamka = String(p.nalez.poznamka);
    zmeny.push(`poznámka: ${data.poznamka}`);
  }
  if (Object.keys(data).length) await prisma.album.update({ where: { id: p.id }, data });
  const zdroje = await ulozZdroje("Album", p.id, p.nalez.zdroje, rozpocet);
  if (zmeny.length || zdroje.length) {
    await zapisHistorii("Album", p.id, "upraveno", `Doplněno: ${[...zmeny, ...zdroje].join("; ")}`);
  }
  return { typ: "Album", id: p.id, nazev: p.nazev, href: `/alba/${p.id}`, zmeny, zdroje };
}

const MAX_KARET_V_DAVCE = 8;

async function doplnitGeminiDavkou<T extends { id: string; nalez: Nalez }>(
  polozky: T[],
  sestavRadek: (p: T) => string,
  poleKlicu: string,
  rozpocet: RozpocetCasu
): Promise<void> {
  for (let i = 0; i < polozky.length; i += MAX_KARET_V_DAVCE) {
    if (rozpocet.vyprsel()) return;
    const davka = polozky.slice(i, i + MAX_KARET_V_DAVCE);
    const prompt = `Jsi redakční asistent hudební databáze Rádio Muflon. Pro KAŽDOU z těchto položek (podle "id") najdi pomocí web search chybějící fakta a ověřitelné URL zdroje.

${davka.map(sestavRadek).join("\n")}

Vrať POUZE JSON pole, jednu položku pro KAŽDÉ zadané "id":
[{"id": "...", ${poleKlicu}, "zdroje": [{"nazev": "", "url": "https://", "kategorie": "oficialni_web|socialni_site|databaze|media|orientacni"}]}]
Co nenajdeš, nech jako null / prázdné pole zdrojů – nevymýšlej si nic.`;

    const text = await zavolejGemini(prompt, { hledat: true, maxVystup: 350 + davka.length * 220 }, rozpocet);
    const pole = vytahniJson(text);
    if (!Array.isArray(pole)) continue;

    const podleId = new Map(davka.map((p) => [p.id, p]));
    for (const polozka of pole as (Nalez & { id?: string })[]) {
      const cil = polozka?.id ? podleId.get(polozka.id) : undefined;
      if (!cil) continue;
      if (!cil.nalez.datumNarozeni && polozka.datumNarozeni) cil.nalez.datumNarozeni = polozka.datumNarozeni;
      if (!cil.nalez.datumUmrti && polozka.datumUmrti) cil.nalez.datumUmrti = polozka.datumUmrti;
      if (!cil.nalez.datumVydani && polozka.datumVydani) cil.nalez.datumVydani = polozka.datumVydani;
      if (!cil.nalez.vydavatel && polozka.vydavatel) cil.nalez.vydavatel = polozka.vydavatel;
      if (!cil.nalez.pseudonymy && polozka.pseudonymy) cil.nalez.pseudonymy = polozka.pseudonymy;
      if (polozka.poznamka) cil.nalez.poznamka = polozka.poznamka;
      cil.nalez.zdroje = slucZdroje(cil.nalez.zdroje, polozka.zdroje);
    }
  }
}

export async function doplnitKatalogDavku(
  limit = 8,
  rozpocet: RozpocetCasu = vytvorRozpocet(VYCHOZI_ROZPOCET_MS)
): Promise<VysledekDoplneni> {
  const vysledek: VysledekDoplneni = { zpracovano: 0, doplneno: 0, zdroje: 0, polozky: [], chyby: [] };
  if (rozpocet.vyprsel()) return vysledek;

  const zdroje = await prisma.zdroj.findMany({
    where: { cilovyTyp: { in: ["Hudebnik", "Album"] } },
    select: { cilovyTyp: true, cilovyId: true },
  });
  const ma = new Set(zdroje.map((z) => `${z.cilovyTyp}:${z.cilovyId}`));

  const [hudebniciVse, albaVse] = await Promise.all([
    prisma.hudebnik.findMany({ select: { id: true, jmeno: true }, orderBy: { updatedAt: "asc" } }),
    prisma.album.findMany({ select: { id: true, nazev: true }, orderBy: { updatedAt: "asc" } }),
  ]);

  const hudebniciId = hudebniciVse.filter((x) => !ma.has(`Hudebnik:${x.id}`)).slice(0, limit);
  const albaId = albaVse.filter((x) => !ma.has(`Album:${x.id}`)).slice(0, limit);

  const pripravyHudebniku: PripravaHudebnika[] = [];
  for (const h of hudebniciId) {
    if (rozpocet.vyprsel()) {
      vysledek.chyby.push("Časový rozpočet vyčerpán, zbytek hudebníků v dávce přeskočen (doběhne příště).");
      break;
    }
    vysledek.zpracovano++;
    try {
      const p = await pripravitVolneZdrojeHudebnika(h.id, rozpocet);
      if (p) pripravyHudebniku.push(p);
    } catch (e) {
      vysledek.chyby.push(`${h.jmeno}: ${(e as Error).message}`);
    }
  }

  const pripravyAlb: PripravaAlba[] = [];
  if (!rozpocet.vyprsel()) {
    for (const a of albaId) {
      if (rozpocet.vyprsel()) {
        vysledek.chyby.push("Časový rozpočet vyčerpán, zbytek alb v dávce přeskočen (doběhne příště).");
        break;
      }
      vysledek.zpracovano++;
      try {
        const p = await pripravitVolneZdrojeAlba(a.id, rozpocet);
        if (p) pripravyAlb.push(p);
      } catch (e) {
        vysledek.chyby.push(`${a.nazev}: ${(e as Error).message}`);
      }
    }
  } else {
    vysledek.chyby.push("Časový rozpočet vyčerpán, alba v téhle dávce se vůbec nezkoušela (doběhne příště).");
  }

  if (!rozpocet.vyprsel()) {
    try {
      await doplnitGeminiDavkou(
        pripravyHudebniku.filter((p) => p.potrebujeGemini),
        (p) => `- id="${p.id}": Hudebník "${p.jmeno}". Kapely: ${p.kapely.join(", ") || "neznámé"}. Chybí: narození/úmrtí/pseudonymy.`,
        `"pseudonymy": null, "datumNarozeni": null, "datumUmrti": null, "poznamka": null`,
        rozpocet
      );
      await doplnitGeminiDavkou(
        pripravyAlb.filter((p) => p.potrebujeGemini),
        (p) => `- id="${p.id}": Album "${p.nazev}". Interpret: ${p.kapely.join(", ") || "neznámý"}. Chybí: datum vydání/vydavatel.`,
        `"datumVydani": null, "vydavatel": null, "poznamka": null`,
        rozpocet
      );
    } catch (e) {
      if (jeKvotaChyba(e)) {
        vysledek.chyby.push("Gemini kvóta. Katalog dál bere Metal Archives a MusicBrainz, textové doplnění přeskočeno pro zbytek dávky.");
      } else {
        vysledek.chyby.push((e as Error).message);
      }
    }
  }

  // Uložení toho, co se stihlo zjistit, proběhne VŽDY (jsou to jen rychlé
  // DB zápisy, žádná další síťová volání) – i když čas vypršel výše.
  for (const p of pripravyHudebniku) {
    try {
      const r = await ulozitHudebnika(p, rozpocet);
      vysledek.polozky.push(r);
      if (r.zmeny.length || r.zdroje.length) vysledek.doplneno++;
      vysledek.zdroje += r.zdroje.length;
    } catch (e) {
      vysledek.chyby.push(`${p.jmeno}: ${(e as Error).message}`);
    }
  }
  for (const p of pripravyAlb) {
    try {
      const r = await ulozitAlbum(p, rozpocet);
      vysledek.polozky.push(r);
      if (r.zmeny.length || r.zdroje.length) vysledek.doplneno++;
      vysledek.zdroje += r.zdroje.length;
    } catch (e) {
      vysledek.chyby.push(`${p.nazev}: ${(e as Error).message}`);
    }
  }

  return vysledek;
}

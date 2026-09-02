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

async function zeptatSeGemini(prompt: string): Promise<Nalez> {
  if (!geminiJeDostupne()) throw new GeminiQuotaError();
  const text = await zavolejGemini(prompt, true);
  const parsed = vytahniJson(text);
  return parsed && typeof parsed === "object" ? (parsed as Nalez) : {};
}

async function ulozZdroje(typ: string, id: string, zdroje: Nalez["zdroje"]): Promise<string[]> {
  const pridane: string[] = [];
  for (const z of zdroje || []) {
    if (!z?.url || !z?.nazev) continue;
    const url = await rozbalRedirect(String(z.url));
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

export async function doplnitHudebnika(id: string): Promise<RadekDoplneni> {
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

  const ma = await najdiHudebnikaNaMetalArchives(h.jmeno, kapely[0] ?? null);
  if (ma) nalez.zdroje = slucZdroje(nalez.zdroje, [ma.zdroj]);
  await pauza(400);

  const mb = await faktaZMusicBrainzHudebnik(h.jmeno);
  if (mb) {
    if (mb.datumNarozeni) nalez.datumNarozeni = mb.datumNarozeni;
    if (mb.datumUmrti) nalez.datumUmrti = mb.datumUmrti;
    if (mb.zdroj) nalez.zdroje = slucZdroje(nalez.zdroje, [mb.zdroj]);
  }
  await pauza(1100);

  const chybiText = !h.poznamka || !h.pseudonymy;
  if (chybiText && geminiJeDostupne()) {
    const zGemini = await zeptatSeGemini(
      `Hudebník: "${h.jmeno}". Kapely: ${kapely.join(", ") || "neznámé"}. Známé: narození=${h.datumNarozeni ?? nalez.datumNarozeni ?? "?"}, úmrtí=${h.datumUmrti ?? nalez.datumUmrti ?? "?"}, pseudonymy=${h.pseudonymy ?? "?"}.
Najdi chybějící fakta (narození/úmrtí, pseudonymy, krátká poznámka) a ověřitelné URL.
Vrať POUZE JSON: {"pseudonymy":null,"datumNarozeni":null,"datumUmrti":null,"poznamka":null,"zdroje":[{"nazev":"","url":"https://","kategorie":"oficialni_web|socialni_site|databaze|media|orientacni"}]}`,
    );
    if (!nalez.datumNarozeni && zGemini.datumNarozeni) nalez.datumNarozeni = zGemini.datumNarozeni;
    if (!nalez.datumUmrti && zGemini.datumUmrti) nalez.datumUmrti = zGemini.datumUmrti;
    if (zGemini.pseudonymy) nalez.pseudonymy = zGemini.pseudonymy;
    if (zGemini.poznamka) nalez.poznamka = zGemini.poznamka;
    nalez.zdroje = slucZdroje(nalez.zdroje, zGemini.zdroje);
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
  const zdroje = await ulozZdroje("Hudebnik", id, nalez.zdroje);
  if (zmeny.length || zdroje.length) {
    await zapisHistorii("Hudebnik", id, "upraveno", `Doplněno: ${[...zmeny, ...zdroje].join("; ")}`);
  }
  return { typ: "Hudebnik", id, nazev: h.jmeno, href: `/hudebnici/${id}`, zmeny, zdroje };
}

export async function doplnitAlbum(id: string): Promise<RadekDoplneni> {
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

  const ma = await najdiAlbaNaMetalArchives(a.nazev, kapely[0] ?? null);
  if (ma) {
    if (ma.datumVydani) nalez.datumVydani = ma.datumVydani;
    nalez.zdroje = slucZdroje(nalez.zdroje, [ma.zdroj]);
  }
  await pauza(400);

  const mb = await faktaZMusicBrainzAlbum(a.nazev, kapely[0] ?? null);
  if (mb) {
    if (!nalez.datumVydani && mb.datumVydani) nalez.datumVydani = mb.datumVydani;
    if (mb.vydavatel) nalez.vydavatel = mb.vydavatel;
    if (mb.zdroj) nalez.zdroje = slucZdroje(nalez.zdroje, [mb.zdroj]);
  }
  await pauza(1100);

  if ((!a.poznamka || !a.vydavatel) && geminiJeDostupne()) {
    const zGemini = await zeptatSeGemini(
      `Album: "${a.nazev}". Interpret: ${kapely.join(", ") || "neznámý"}. Známé: vydání=${a.datumVydani ?? nalez.datumVydani ?? "?"}, vydavatel=${a.vydavatel ?? nalez.vydavatel ?? "?"}.
Najdi chybějící datum vydání, vydavatele, krátkou poznámku a ověřitelné URL.
Vrať POUZE JSON: {"datumVydani":null,"vydavatel":null,"poznamka":null,"zdroje":[{"nazev":"","url":"https://","kategorie":"oficialni_web|socialni_site|databaze|media|orientacni"}]}`,
    );
    if (!nalez.datumVydani && zGemini.datumVydani) nalez.datumVydani = zGemini.datumVydani;
    if (!nalez.vydavatel && zGemini.vydavatel) nalez.vydavatel = zGemini.vydavatel;
    if (zGemini.poznamka) nalez.poznamka = zGemini.poznamka;
    nalez.zdroje = slucZdroje(nalez.zdroje, zGemini.zdroje);
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
  const zdroje = await ulozZdroje("Album", id, nalez.zdroje);
  if (zmeny.length || zdroje.length) {
    await zapisHistorii("Album", id, "upraveno", `Doplněno: ${[...zmeny, ...zdroje].join("; ")}`);
  }
  return { typ: "Album", id, nazev: a.nazev, href: `/alba/${id}`, zmeny, zdroje };
}

export async function doplnitKatalogDavku(limit = 4): Promise<VysledekDoplneni> {
  const zdroje = await prisma.zdroj.findMany({
    where: { cilovyTyp: { in: ["Hudebnik", "Album"] } },
    select: { cilovyTyp: true, cilovyId: true },
  });
  const ma = new Set(zdroje.map((z) => `${z.cilovyTyp}:${z.cilovyId}`));

  const [hudebnici, alba] = await Promise.all([
    prisma.hudebnik.findMany({ select: { id: true, jmeno: true }, orderBy: { updatedAt: "asc" } }),
    prisma.album.findMany({ select: { id: true, nazev: true }, orderBy: { updatedAt: "asc" } }),
  ]);

  const vysledek: VysledekDoplneni = { zpracovano: 0, doplneno: 0, zdroje: 0, polozky: [], chyby: [] };

  for (const h of hudebnici.filter((x) => !ma.has(`Hudebnik:${x.id}`)).slice(0, limit)) {
    vysledek.zpracovano++;
    try {
      const r = await doplnitHudebnika(h.id);
      vysledek.polozky.push(r);
      if (r.zmeny.length || r.zdroje.length) vysledek.doplneno++;
      vysledek.zdroje += r.zdroje.length;
    } catch (e) {
      if (jeKvotaChyba(e)) {
        vysledek.chyby.push("Gemini kvóta. Katalog dál bere Metal Archives a MusicBrainz, textové doplnění přeskočeno.");
        break;
      }
      vysledek.chyby.push(`${h.jmeno}: ${(e as Error).message}`);
    }
  }
  for (const a of alba.filter((x) => !ma.has(`Album:${x.id}`)).slice(0, limit)) {
    vysledek.zpracovano++;
    try {
      const r = await doplnitAlbum(a.id);
      vysledek.polozky.push(r);
      if (r.zmeny.length || r.zdroje.length) vysledek.doplneno++;
      vysledek.zdroje += r.zdroje.length;
    } catch (e) {
      if (jeKvotaChyba(e)) {
        vysledek.chyby.push("Gemini kvóta. Zbytek textového doplnění přeskočen.");
        break;
      }
      vysledek.chyby.push(`${a.nazev}: ${(e as Error).message}`);
    }
  }
  return vysledek;
}

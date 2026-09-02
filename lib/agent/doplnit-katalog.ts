import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import {
  nazevZeZdroje,
  POZNAMKA_AI_ROZSIRENI,
  urovenDuveryZeZdroje,
} from "@/lib/constants";
import { rozbalRedirect } from "@/lib/agent/redirect";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent";

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

async function zeptatSeGemini(prompt: string): Promise<Nalez> {
  const apiKlic = process.env.GEMINI_API_KEY;
  if (!apiKlic) throw new Error("Chybí GEMINI_API_KEY.");

  const odpoved = await fetch(`${GEMINI_URL}?key=${apiKlic}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
    }),
  });
  if (!odpoved.ok) throw new Error(`Gemini API ${odpoved.status}`);

  const data = await odpoved.json();
  const text = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("\n")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = text.indexOf("{");
  const konec = text.lastIndexOf("}");
  if (start === -1 || konec === -1) return {};
  try {
    return JSON.parse(text.slice(start, konec + 1));
  } catch {
    return {};
  }
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

  const kapely = h.clenstvi.map((c) => c.interpret.nazev).join(", ");
  const nalez = await zeptatSeGemini(
    `Hudebník: "${h.jmeno}". Kapely: ${kapely || "neznámé"}. Známé: narození=${h.datumNarozeni ?? "?"}, úmrtí=${h.datumUmrti ?? "?"}, pseudonymy=${h.pseudonymy ?? "?"}.
Najdi chybějící fakta (narození/úmrtí, pseudonymy, krátká poznámka) a ověřitelné URL.
Vrať POUZE JSON: {"pseudonymy":null,"datumNarozeni":null,"datumUmrti":null,"poznamka":null,"zdroje":[{"nazev":"","url":"https://","kategorie":"oficialni_web|socialni_site|databaze|media|orientacni"}]}`,
  );

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

  const kapely = a.interpreti.map((i) => i.interpret.nazev).join(", ");
  const nalez = await zeptatSeGemini(
    `Album: "${a.nazev}". Interpret: ${kapely || "neznámý"}. Známé: vydání=${a.datumVydani ?? "?"}, vydavatel=${a.vydavatel ?? "?"}.
Najdi chybějící datum vydání, vydavatele, krátkou poznámku a ověřitelné URL.
Vrať POUZE JSON: {"datumVydani":null,"vydavatel":null,"poznamka":null,"zdroje":[{"nazev":"","url":"https://","kategorie":"oficialni_web|socialni_site|databaze|media|orientacni"}]}`,
  );

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
      vysledek.chyby.push(`${a.nazev}: ${(e as Error).message}`);
    }
  }
  return vysledek;
}

import { RENOMOVANE_ZDROJE_DOMENY } from "@/lib/constants";
import { rozbalRedirect } from "./redirect";
import { GeminiQuotaError, geminiJeDostupne, vytahniJson, zavolejGemini } from "./gemini";
import {
  najdiAlbaNaMetalArchives,
  najdiHudebnikaNaMetalArchives,
  najdiKapeluNaMetalArchives,
} from "./databaze";

export type NalezenyZdroj = { nazev: string; url: string; kategorie: string } | null;

function sestavPrompt(nazev: string, obsah: string): string {
  const seznamZdroju = RENOMOVANE_ZDROJE_DOMENY.join(", ");
  return `Jsi redakční fact-checker hudební databáze Rádio Muflon (zaměření: rock a metal). Máme tenhle údaj, u kterého zatím chybí zdroj:

"${nazev}: ${obsah}"

Pomocí web search zkus dohledat zdroj, který tohle tvrzení potvrzuje. Přijímej POUZE:
1) oficiální web interpreta,
2) oficiální sociální síť interpreta,
3) záznam/článek na jedné z těchto renomovaných domén (databáze i média, redakčně odsouhlasený seznam): ${seznamZdroju}.

Žádné jiné zdroje nepoužívej – Wikipedii, obecné hudební databáze mimo seznam (Discogs, MusicBrainz), fanouškovské weby, rozhovory ani knihy v tomhle případě NEPOČÍTEJ jako dostatečné, i kdyby tvrzení potvrzovaly. Pokud nic z bodů 1–3 nenajdeš, vrať nalezeno: false – nevymýšlej si zdroj a nepoužívej slabší náhradu.

Vrať POUZE JSON (bez markdown):
{"nalezeno": true, "nazev": "název zdroje/článku", "url": "https://...", "kategorie": "oficialni_web|socialni_site|media|databaze"}
nebo
{"nalezeno": false}`;
}

async function zDatabazi(nazev: string, obsah: string): Promise<NalezenyZdroj> {
  const text = `${nazev} ${obsah}`;
  const kapela = await najdiKapeluNaMetalArchives(nazev);
  if (kapela) return kapela;

  const album = await najdiAlbaNaMetalArchives(nazev);
  if (album) return album.zdroj;

  const hudebnik = await najdiHudebnikaNaMetalArchives(nazev);
  if (hudebnik) return hudebnik.zdroj;

  const uvozovky = text.match(/[„"]([^"„”]{2,80})["”]/);
  if (uvozovky?.[1]) {
    const zAlba = await najdiAlbaNaMetalArchives(uvozovky[1]);
    if (zAlba) return zAlba.zdroj;
    const zKapely = await najdiKapeluNaMetalArchives(uvozovky[1]);
    if (zKapely) return zKapely;
  }
  return null;
}

export async function dohledatZdroj(nazev: string, obsah: string): Promise<NalezenyZdroj> {
  try {
    const zDb = await zDatabazi(nazev, obsah);
    if (zDb) return zDb;
  } catch {
    // databáze jen šetří kvótu – výpadek není „nenalezeno“
  }

  if (!geminiJeDostupne()) throw new GeminiQuotaError();

  const surovyText = await zavolejGemini(sestavPrompt(nazev, obsah), true);
  const parsed = vytahniJson(surovyText) as {
    nalezeno?: boolean;
    url?: string;
    nazev?: string;
    kategorie?: string;
  } | null;
  if (!parsed?.nalezeno || !parsed.url || !parsed.nazev) return null;
  const kategorie = ["oficialni_web", "socialni_site", "media", "databaze"].includes(parsed.kategorie ?? "")
    ? parsed.kategorie!
    : "media";
  const url = await rozbalRedirect(String(parsed.url));
  return { nazev: String(parsed.nazev).slice(0, 200), url, kategorie };
}

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

export type PolozkaKDohledani = { klic: string; nazev: string; obsah: string };

const MAX_POLOZEK_V_DAVCE = 10;

function sestavDavkovyPrompt(polozky: PolozkaKDohledani[]): string {
  const seznamZdroju = RENOMOVANE_ZDROJE_DOMENY.join(", ");
  const seznamPolozek = polozky
    .map((p) => `- klic="${p.klic}": "${p.nazev}: ${p.obsah}"`)
    .join("\n");
  return `Jsi redakční fact-checker hudební databáze Rádio Muflon (zaměření: rock a metal). Máme tyhle údaje, u kterých zatím chybí zdroj:

${seznamPolozek}

Pro KAŽDOU položku zvlášť (podle jejího "klic") pomocí web search zkus dohledat zdroj, který dané tvrzení potvrzuje. Přijímej POUZE:
1) oficiální web interpreta,
2) oficiální sociální síť interpreta,
3) záznam/článek na jedné z těchto renomovaných domén (databáze i média, redakčně odsouhlasený seznam): ${seznamZdroju}.

Žádné jiné zdroje nepoužívej – Wikipedii, obecné hudební databáze mimo seznam (Discogs, MusicBrainz), fanouškovské weby, rozhovory ani knihy v tomhle případě NEPOČÍTEJ jako dostatečné, i kdyby tvrzení potvrzovaly. Pokud pro danou položku nic z bodů 1–3 nenajdeš, u ní vrať nalezeno: false – nevymýšlej si zdroj a nepoužívej slabší náhradu.

Vrať POUZE JSON pole (žádný text okolo, žádné markdown zpětné uvozovky), jednu položku pro KAŽDÝ zadaný "klic":
[{"klic": "...", "nalezeno": true, "nazev": "název zdroje/článku", "url": "https://...", "kategorie": "oficialni_web|socialni_site|media|databaze"}, {"klic": "...", "nalezeno": false}]`;
}

/**
 * Dávková varianta dohledatZdroj: nejdřív u KAŽDÉ položky zkusí zdarma
 * Metal Archives (stejně jako jednotlivá verze), a teprve položky, které
 * tudy nenajdou zdroj, pošle Gemini v JEDNOM groundovaném promptu místo
 * jednoho volání na položku. Vrací mapu klic -> nalezený zdroj (nebo null).
 */
export async function dohledatZdrojeVDavce(
  polozky: PolozkaKDohledani[]
): Promise<Map<string, NalezenyZdroj>> {
  const vysledek = new Map<string, NalezenyZdroj>();
  const zbyvaji: PolozkaKDohledani[] = [];

  for (const p of polozky) {
    try {
      const zDb = await zDatabazi(p.nazev, p.obsah);
      if (zDb) {
        vysledek.set(p.klic, zDb);
        continue;
      }
    } catch {
      // databáze jen šetří kvótu – výpadek není „nenalezeno“
    }
    zbyvaji.push(p);
  }

  if (zbyvaji.length === 0) return vysledek;
  if (!geminiJeDostupne()) throw new GeminiQuotaError();

  for (let i = 0; i < zbyvaji.length; i += MAX_POLOZEK_V_DAVCE) {
    const davka = zbyvaji.slice(i, i + MAX_POLOZEK_V_DAVCE);
    const surovyText = await zavolejGemini(sestavDavkovyPrompt(davka), {
      hledat: true,
      maxVystup: 400 + davka.length * 160,
    });
    const pole = vytahniJson(surovyText);
    if (!Array.isArray(pole)) continue;

    for (const polozka of pole as {
      klic?: string;
      nalezeno?: boolean;
      url?: string;
      nazev?: string;
      kategorie?: string;
    }[]) {
      if (!polozka?.klic) continue;
      if (!polozka.nalezeno || !polozka.url || !polozka.nazev) {
        vysledek.set(polozka.klic, null);
        continue;
      }
      const kategorie = ["oficialni_web", "socialni_site", "media", "databaze"].includes(
        polozka.kategorie ?? ""
      )
        ? polozka.kategorie!
        : "media";
      const url = await rozbalRedirect(String(polozka.url));
      vysledek.set(polozka.klic, { nazev: String(polozka.nazev).slice(0, 200), url, kategorie });
    }
  }

  return vysledek;
}

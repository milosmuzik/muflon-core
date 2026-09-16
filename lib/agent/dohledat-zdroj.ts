import { RENOMOVANE_ZDROJE_DOMENY } from "@/lib/constants";
import { rozbalRedirect } from "./redirect";
import { GeminiQuotaError, geminiJeDostupne, jeKvotaChyba, vytahniJson, zavolejGemini } from "./gemini";
import {
  najdiAlbaNaMetalArchives,
  najdiHudebnikaNaMetalArchives,
  najdiKapeluNaMetalArchives,
} from "./databaze";
import { type RozpocetCasu, VYCHOZI_ROZPOCET_MS, vytvorRozpocet } from "@/lib/agent/rozpocet-casu";

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

async function zDatabazi(nazev: string, obsah: string, rozpocet: RozpocetCasu): Promise<NalezenyZdroj> {
  const text = `${nazev} ${obsah}`;
  const kapela = await najdiKapeluNaMetalArchives(nazev, rozpocet);
  if (kapela) return kapela;
  if (rozpocet.vyprsel()) return null;

  const album = await najdiAlbaNaMetalArchives(nazev, undefined, rozpocet);
  if (album) return album.zdroj;
  if (rozpocet.vyprsel()) return null;

  const hudebnik = await najdiHudebnikaNaMetalArchives(nazev, undefined, rozpocet);
  if (hudebnik) return hudebnik.zdroj;
  if (rozpocet.vyprsel()) return null;

  const uvozovky = text.match(/[„"]([^"„”]{2,80})["”]/);
  if (uvozovky?.[1]) {
    const zAlba = await najdiAlbaNaMetalArchives(uvozovky[1], undefined, rozpocet);
    if (zAlba) return zAlba.zdroj;
    if (rozpocet.vyprsel()) return null;
    const zKapely = await najdiKapeluNaMetalArchives(uvozovky[1], rozpocet);
    if (zKapely) return zKapely;
  }
  return null;
}

export async function dohledatZdroj(
  nazev: string,
  obsah: string,
  rozpocet: RozpocetCasu = vytvorRozpocet(VYCHOZI_ROZPOCET_MS)
): Promise<NalezenyZdroj> {
  try {
    const zDb = await zDatabazi(nazev, obsah, rozpocet);
    if (zDb) return zDb;
  } catch {
    // databáze jen šetří kvótu – výpadek není „nenalezeno“
  }

  if (!geminiJeDostupne()) throw new GeminiQuotaError();

  const surovyText = await zavolejGemini(sestavPrompt(nazev, obsah), true, rozpocet);
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
  const url = await rozbalRedirect(String(parsed.url), rozpocet);
  return { nazev: String(parsed.nazev).slice(0, 200), url, kategorie };
}

export type PolozkaKDohledani = { klic: string; nazev: string; obsah: string };

/**
 * Návratový typ dávkové varianty: `vysledky` obsahuje `null`, pokud se
 * položka DOOPRAVDY zkontrolovala a nic se nenašlo (volající to smí brát
 * jako "nenalezeno" a podle toho jednat, i mazat). `nezpracovano` obsahuje
 * klíče položek, ke kterým se kvůli časovému rozpočtu vůbec nedošlo – ty
 * volající MUSÍ nechat beze změny, ne je vyhodnotit jako "nenalezeno" (viz
 * dohledatChybejiciZdroje v dohledat-zdroje-hromadne.ts, kde by záměna
 * těchhle dvou stavů znamenala smazání příběhu/události jen proto, že na
 * kontrolu nezbyl čas).
 */
export type VysledekDohledaniDavky = {
  vysledky: Map<string, NalezenyZdroj>;
  nezpracovano: Set<string>;
};

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

Žádné jiné zdroje nepoužívej – Wikipedii, obecné hudební databáze mimo seznam (Discogs, MusicBrainz), fanouškovské weby, rozhovory ani knihy v tomhle případě NEPOČÍTEJTE jako dostatečné, i kdyby tvrzení potvrzovaly. Pokud pro danou položku nic z bodů 1–3 nenajdeš, u ní vrať nalezeno: false – nevymýšlej si zdroj a nepoužívej slabší náhradu.

Vrať POUZE JSON pole (žádný text okolo, žádné markdown zpětné uvozovky), jednu položku pro KAŽDÝ zadaný "klic":
[{"klic": "...", "nalezeno": true, "nazev": "název zdroje/článku", "url": "https://...", "kategorie": "oficialni_web|socialni_site|media|databaze"}, {"klic": "...", "nalezeno": false}]`;
}

/**
 * Dávková varianta dohledatZdroj: nejdřív u KAŽDÉ položky zkusí zdarma
 * Metal Archives (stejně jako jednotlivá verze), a teprve položky, které
 * tudy nenajdou zdroj, pošle Gemini v dávkách po MAX_POLOZEK_V_DAVCE
 * (groundovaný prompt na víc položek najednou místo jednoho volání na
 * položku). Viz VysledekDohledaniDavky výše pro rozdíl mezi "nenalezeno" a
 * "nezpracováno kvůli rozpočtu" – volající na něm závisí, aby kvůli
 * časovému tlaku omylem nesmazal nezkontrolované záznamy.
 */
export async function dohledatZdrojeVDavce(
  polozky: PolozkaKDohledani[],
  rozpocet: RozpocetCasu = vytvorRozpocet(VYCHOZI_ROZPOCET_MS)
): Promise<VysledekDohledaniDavky> {
  const vysledek = new Map<string, NalezenyZdroj>();
  const nezpracovano = new Set<string>();
  const zbyvaji: PolozkaKDohledani[] = [];

  for (const p of polozky) {
    if (rozpocet.vyprsel()) {
      nezpracovano.add(p.klic);
      continue;
    }
    try {
      const zDb = await zDatabazi(p.nazev, p.obsah, rozpocet);
      if (zDb) {
        vysledek.set(p.klic, zDb);
        continue;
      }
    } catch {
      // databáze jen šetří kvótu – výpadek není „nenalezeno“
    }
    zbyvaji.push(p);
  }

  if (zbyvaji.length === 0) return { vysledky: vysledek, nezpracovano };
  if (rozpocet.vyprsel()) {
    for (const p of zbyvaji) nezpracovano.add(p.klic);
    return { vysledky: vysledek, nezpracovano };
  }
  if (!geminiJeDostupne()) throw new GeminiQuotaError();

  for (let i = 0; i < zbyvaji.length; i += MAX_POLOZEK_V_DAVCE) {
    if (rozpocet.vyprsel()) {
      for (const p of zbyvaji.slice(i)) nezpracovano.add(p.klic);
      break;
    }
    const davka = zbyvaji.slice(i, i + MAX_POLOZEK_V_DAVCE);
    let surovyText: string;
    try {
      surovyText = await zavolejGemini(
        sestavDavkovyPrompt(davka),
        { hledat: true, maxVystup: 400 + davka.length * 160 },
        rozpocet
      );
    } catch (e) {
      if (jeKvotaChyba(e)) throw e; // zachovat původní chování: kvóta ruší celou dávku
      // Časový rozpočet nebo jiná chyba uprostřed dávky: tahle dávka
      // zůstává nezpracovaná (zkusí se příště), NENÍ to "nenalezeno".
      for (const p of davka) nezpracovano.add(p.klic);
      continue;
    }
    const pole = vytahniJson(surovyText);
    if (!Array.isArray(pole)) {
      for (const p of davka) nezpracovano.add(p.klic);
      continue;
    }

    const vracenoVDavce = new Set<string>();
    for (const polozka of pole as {
      klic?: string;
      nalezeno?: boolean;
      url?: string;
      nazev?: string;
      kategorie?: string;
    }[]) {
      if (!polozka?.klic) continue;
      vracenoVDavce.add(polozka.klic);
      if (!polozka.nalezeno || !polozka.url || !polozka.nazev) {
        vysledek.set(polozka.klic, null);
        continue;
      }
      const kategorie = ["oficialni_web", "socialni_site", "media", "databaze"].includes(
        polozka.kategorie ?? ""
      )
        ? polozka.kategorie!
        : "media";
      const url = await rozbalRedirect(String(polozka.url), rozpocet);
      vysledek.set(polozka.klic, { nazev: String(polozka.nazev).slice(0, 200), url, kategorie });
    }
    // Cokoliv v dávce, co Gemini vůbec nevrátilo (chybí v poli), je taky
    // nezpracované, ne "nenalezeno".
    for (const p of davka) {
      if (!vracenoVDavce.has(p.klic)) nezpracovano.add(p.klic);
    }
  }

  return { vysledky: vysledek, nezpracovano };
}

import { pripravSeNaGrounded, zavriJistic } from "@/lib/agent/rozpocet";
import { GEMINI_TIMEOUT_MS } from "@/lib/constants";
import { type RozpocetCasu, chybaVyprseni, jeChybaVyprseni, signalNaVolani } from "@/lib/agent/rozpocet-casu";

export class GeminiQuotaError extends Error {
  constructor(message = "Gemini kvóta vyčerpaná. Dávka zastavena, nic se nemazalo.") {
    super(message);
    this.name = "GeminiQuotaError";
  }
}

/**
 * Model lze přepnout proměnnou prostředí GEMINI_MODEL (např. na konkrétní
 * verzi místo aliasu), bez zásahu do kódu. Výchozí hodnota je zatím alias
 * "-latest", který Google může bez upozornění přesměrovat na novější model
 * s jiným ceníkem groundingu – proto je dobré v AI Studiu ověřit, kam
 * alias právě míří, a model pak zafixovat přes GEMINI_MODEL.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/** Webový zdroj, který Google skutečně použil při groundingu (ne text, který model napsal). */
export type GroundingZdroj = { uri: string; title: string };

export type GeminiOdpoved = { text: string; zdroje: GroundingZdroj[] };

/**
 * Rychlý, synchronní předběžný test (jen "je nastavený API klíč?"). NENÍ
 * autoritativní pro rozpočet/jistič – ten se (persistentně, v DB) vyhodnocuje
 * až uvnitř zavolejGemini těsně před síťovým voláním, protože tudy prochází
 * úplně každé volání Gemini a jde o jediné bezpečné místo pro vynucení.
 * Volající to můžou použít jako levnou zkratku, aby se vyhnuli zbytečné
 * přípravě promptu, když Gemini očividně není nakonfigurovaná – nic víc.
 */
export function geminiJeDostupne(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function jeKvotaChyba(e: unknown): boolean {
  return e instanceof GeminiQuotaError || /429|RESOURCE_EXHAUSTED|kvóta/i.test((e as Error)?.message ?? "");
}

type GeminiVolani = {
  hledat?: boolean;
  maxVystup?: number;
};

/**
 * `rozpocet`, pokud je předaný, dělá dvě věci navíc oproti dřívějšku:
 * 1) když už z celkového rozpočtu (cron) nic nezbývá, volání se vůbec
 *    nezahájí (ani se nečeká na pacing mezeru přes pripravSeNaGrounded) -
 *    vrátí se rovnou chyba rozpoznatelná přes jeChybaVyprseni/e.name.
 * 2) samotný fetch dostane signál, který se zkrátí na to, co z rozpočtu
 *    ještě reálně zbývá, místo pevných GEMINI_TIMEOUT_MS.
 */
export async function zavolejGemini(
  prompt: string,
  volba: boolean | GeminiVolani = false,
  rozpocet?: RozpocetCasu
): Promise<string> {
  return (await zavolejGeminiSeZdroji(prompt, volba, rozpocet)).text;
}

/**
 * Stejné jako zavolejGemini, ale vrátí i seznam zdrojů z groundingMetadata –
 * tedy stránek, které Google Search opravdu našel. Slouží k odhalení URL,
 * které si model v JSON odpovědi vymyslel (viz navrhy-kalendar.ts).
 */
export async function zavolejGeminiSeZdroji(
  prompt: string,
  volba: boolean | GeminiVolani = false,
  rozpocet?: RozpocetCasu
): Promise<GeminiOdpoved> {
  const apiKlic = process.env.GEMINI_API_KEY;
  if (!apiKlic) throw new GeminiQuotaError("Chybí GEMINI_API_KEY.");
  if (rozpocet?.vyprsel()) throw chybaVyprseni("Časový rozpočet vyčerpán, Gemini se nevolá.");

  const sHledanim = typeof volba === "boolean" ? volba : Boolean(volba.hledat);
  const maxVystup = typeof volba === "boolean" ? (sHledanim ? 800 : 1200) : (volba.maxVystup ?? (sHledanim ? 800 : 1200));

  // Grounding (web search) je nejvzácnější zdroj appky (Google: 1500 RPD,
  // appka má bezpečný strop ještě níž) – rozpočet a pacing se kontrolují a
  // vynucují přes perzistentní DB tabulku, ne jen v paměti procesu.
  if (sHledanim) {
    const povoleni = await pripravSeNaGrounded();
    if (!povoleni.ok) throw new GeminiQuotaError(povoleni.duvod);
  }

  if (rozpocet?.vyprsel()) throw chybaVyprseni("Časový rozpočet vypršel během čekání na pacing Gemini.");

  let odpoved: Response;
  try {
    odpoved = await fetch(`${GEMINI_URL}?key=${apiKlic}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxVystup,
          temperature: 0.2,
        },
        ...(sHledanim ? { tools: [{ google_search: {} }] } : {}),
      }),
      signal: rozpocet ? signalNaVolani(rozpocet, GEMINI_TIMEOUT_MS) : AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
  } catch (e) {
    if (jeChybaVyprseni(e)) throw e;
    if ((e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError") {
      throw new Error(`Gemini API neodpověděla do ${GEMINI_TIMEOUT_MS / 1000}s (timeout).`);
    }
    throw e;
  }

  if (odpoved.status === 429 || odpoved.status === 503) {
    const text = await odpoved.text();
    const prepay = /RESOURCE_EXHAUSTED|quota|billing|credit/i.test(text);
    await zavriJistic(prepay ? 6 * 60 * 60 * 1000 : 15 * 60 * 1000);
    throw new GeminiQuotaError(`Gemini API ${odpoved.status}: ${text.slice(0, 180)}`);
  }

  if (!odpoved.ok) {
    const text = await odpoved.text();
    throw new Error(`Gemini API ${odpoved.status}: ${text.slice(0, 300)}`);
  }

  // Groundované volání už je započítané předem (atomická rezervace v pripravSeNaGrounded).

  const data = await odpoved.json();
  const kandidat = data?.candidates?.[0];
  const casti = kandidat?.content?.parts ?? [];
  const text = casti.map((c: { text?: string }) => c.text ?? "").join("\n").trim();
  const zdroje = vytahniGroundingZdroje(kandidat);
  if (!text) {
    const duvod = kandidat?.finishReason ?? data?.promptFeedback?.blockReason ?? "";
    if (/SAFETY|BLOCK/i.test(String(duvod))) return { text: "", zdroje };
    throw new Error("Gemini vrátila prázdnou odpověď.");
  }
  return { text, zdroje };
}

export function vytahniGroundingZdroje(kandidat: unknown): GroundingZdroj[] {
  const chunks = (kandidat as { groundingMetadata?: { groundingChunks?: unknown[] } })?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const vysledek: GroundingZdroj[] = [];
  for (const c of chunks) {
    const web = (c as { web?: { uri?: unknown; title?: unknown } })?.web;
    if (web && typeof web.uri === "string") {
      vysledek.push({ uri: web.uri, title: typeof web.title === "string" ? web.title : "" });
    }
  }
  return vysledek;
}

export function vytahniJson(text: string): unknown | null {
  const ocistene = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const startObj = ocistene.indexOf("{");
  const startArr = ocistene.indexOf("[");
  const start =
    startObj === -1 ? startArr : startArr === -1 ? startObj : Math.min(startObj, startArr);
  if (start === -1) return null;
  const konec = ocistene[start] === "[" ? ocistene.lastIndexOf("]") : ocistene.lastIndexOf("}");
  if (konec === -1) return null;
  try {
    return JSON.parse(ocistene.slice(start, konec + 1));
  } catch {
    return null;
  }
}

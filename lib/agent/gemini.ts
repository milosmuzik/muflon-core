import { pripravSeNaGrounded, zaznamenejGrounded, zavriJistic } from "@/lib/agent/rozpocet";

export class GeminiQuotaError extends Error {
  constructor(message = "Gemini kvóta vyčerpaná. Dávka zastavena, nic se nemazalo.") {
    super(message);
    this.name = "GeminiQuotaError";
  }
}

const GEMINI_MODEL = "gemini-flash-lite-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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

export async function zavolejGemini(prompt: string, volba: boolean | GeminiVolani = false): Promise<string> {
  const apiKlic = process.env.GEMINI_API_KEY;
  if (!apiKlic) throw new GeminiQuotaError("Chybí GEMINI_API_KEY.");

  const sHledanim = typeof volba === "boolean" ? volba : Boolean(volba.hledat);
  const maxVystup = typeof volba === "boolean" ? (sHledanim ? 800 : 1200) : (volba.maxVystup ?? (sHledanim ? 800 : 1200));

  // Grounding (web search) je nejvzácnější zdroj appky (Google: 1500 RPD,
  // appka má bezpečný strop ještě níž) – rozpočet a pacing se kontrolují a
  // vynucují přes perzistentní DB tabulku, ne jen v paměti procesu.
  if (sHledanim) {
    const povoleni = await pripravSeNaGrounded();
    if (!povoleni.ok) throw new GeminiQuotaError(povoleni.duvod);
  }

  const odpoved = await fetch(`${GEMINI_URL}?key=${apiKlic}`, {
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
  });

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

  if (sHledanim) await zaznamenejGrounded();

  const data = await odpoved.json();
  const casti = data?.candidates?.[0]?.content?.parts ?? [];
  const text = casti.map((c: { text?: string }) => c.text ?? "").join("\n").trim();
  if (!text) {
    const duvod = data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason ?? "";
    if (/SAFETY|BLOCK/i.test(String(duvod))) return "";
    throw new Error("Gemini vrátila prázdnou odpověď.");
  }
  return text;
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

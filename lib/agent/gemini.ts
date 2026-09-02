export class GeminiQuotaError extends Error {
  constructor(message = "Gemini kvóta vyčerpaná. Dávka zastavena, nic se nemazalo.") {
    super(message);
    this.name = "GeminiQuotaError";
  }
}

const GEMINI_MODEL = "gemini-flash-lite-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

let obvodDo = 0;

export function geminiJeDostupne(): boolean {
  return Date.now() >= obvodDo && Boolean(process.env.GEMINI_API_KEY);
}

export function jeKvotaChyba(e: unknown): boolean {
  return e instanceof GeminiQuotaError || /429|RESOURCE_EXHAUSTED|kvóta/i.test((e as Error)?.message ?? "");
}

function uzavriObvod(ms: number) {
  obvodDo = Math.max(obvodDo, Date.now() + ms);
}

export async function zavolejGemini(prompt: string, sHledanim = true): Promise<string> {
  const apiKlic = process.env.GEMINI_API_KEY;
  if (!apiKlic) throw new GeminiQuotaError("Chybí GEMINI_API_KEY.");
  if (Date.now() < obvodDo) throw new GeminiQuotaError();

  const odpoved = await fetch(`${GEMINI_URL}?key=${apiKlic}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      ...(sHledanim ? { tools: [{ google_search: {} }] } : {}),
    }),
  });

  if (odpoved.status === 429 || odpoved.status === 503) {
    const text = await odpoved.text();
    const prepay = /RESOURCE_EXHAUSTED|quota|billing|credit/i.test(text);
    uzavriObvod(prepay ? 6 * 60 * 60 * 1000 : 15 * 60 * 1000);
    throw new GeminiQuotaError(`Gemini API ${odpoved.status}: ${text.slice(0, 180)}`);
  }

  if (!odpoved.ok) {
    const text = await odpoved.text();
    throw new Error(`Gemini API ${odpoved.status}: ${text.slice(0, 300)}`);
  }

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

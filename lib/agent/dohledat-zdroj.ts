import { RENOMOVANE_ZDROJE_DOMENY } from "@/lib/constants";

const GEMINI_MODEL = "gemini-flash-lite-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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

export async function dohledatZdroj(nazev: string, obsah: string): Promise<NalezenyZdroj> {
  const apiKlic = process.env.GEMINI_API_KEY;
  if (!apiKlic) throw new Error("Chybí GEMINI_API_KEY.");

  const odpoved = await fetch(`${GEMINI_URL}?key=${apiKlic}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: sestavPrompt(nazev, obsah) }] }],
      tools: [{ google_search: {} }],
    }),
  });

  if (!odpoved.ok) {
    const chybaText = await odpoved.text();
    throw new Error(`Gemini API ${odpoved.status}: ${chybaText.slice(0, 300)}`);
  }

  const data = await odpoved.json();
  const surovyText = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("\n");
  const ocistene = surovyText.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = ocistene.indexOf("{");
  const konec = ocistene.lastIndexOf("}");
  if (start === -1 || konec === -1) return null;

  try {
    const parsed = JSON.parse(ocistene.slice(start, konec + 1));
    if (!parsed?.nalezeno || !parsed.url || !parsed.nazev) return null;
    const kategorie = ["oficialni_web", "socialni_site", "media", "databaze"].includes(parsed.kategorie)
      ? parsed.kategorie
      : "media";
    return { nazev: String(parsed.nazev).slice(0, 200), url: String(parsed.url), kategorie };
  } catch {
    return null;
  }
}

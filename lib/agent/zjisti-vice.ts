import { rozbalRedirect } from "./redirect";

const GEMINI_MODEL = "gemini-flash-lite-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export type RozsireniVysledek = {
  rozsireni: string;
  zdroje: { nazev: string; url: string; kategorie: string }[];
};

export async function zjistiVice(nazev: string, znamyPopis: string | null): Promise<RozsireniVysledek> {
  const apiKlic = process.env.GEMINI_API_KEY;
  if (!apiKlic) throw new Error("Chybí GEMINI_API_KEY.");

  const prompt = `Jsi redakční asistent hudební databáze Rádio Muflon. K události "${nazev}" už máme tuto informaci: "${znamyPopis ?? "(zatím nic)"}"

Pomocí web search najdi DALŠÍ, hlubší podrobnosti k tomuto tématu (konkrétní fakta, souvislosti, zajímavosti) — neopakuj to, co už víme výše. Dodržuj hierarchii zdrojů: 1) oficiální web, 2) oficiální sociální sítě, 3) renomované hudební databáze/encyklopedie (Metal Archives/Encyclopaedia Metallum, AllMusic, Rate Your Music, Metal Storm), 4) dlouhodobě zavedená hudební média (Decibel, BraveWords, Kerrang!, Metal Hammer, Rock Hard, Spark Rock Magazine, Rock&Pop, BURRN!, Blabbermouth, Loudwire, Metal Injection, Angry Metal Guy, Revolver), 5) archivní materiály, 6) rozhovory, 7) knihy. Wikipedii a obecné databáze mimo výše uvedený seznam (Discogs, MusicBrainz) použij jen orientačně. Preferuj zdroje z bodů 1–4 – ty jediné stačí samy o sobě k automatickému schválení.

Vrať POUZE JSON (bez markdown):
{"rozsireni": "2-4 věty nových podrobností, vlastními slovy", "zdroje": [{"nazev": "...", "url": "https://...", "kategorie": "jedna z: oficialni_web|socialni_site|archivni|databaze|media|rozhovor|kniha|orientacni"}]}
Pokud nic nového ověřitelného nenajdeš, vrať {"rozsireni": "", "zdroje": []}.`;

  const odpoved = await fetch(`${GEMINI_URL}?key=${apiKlic}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
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
  if (start === -1 || konec === -1) return { rozsireni: "", zdroje: [] };

  try {
    const vysledek: RozsireniVysledek = JSON.parse(ocistene.slice(start, konec + 1));
    for (const zdroj of vysledek.zdroje || []) {
      if (zdroj.url) zdroj.url = await rozbalRedirect(zdroj.url);
    }
    return vysledek;
  } catch {
    return { rozsireni: "", zdroje: [] };
  }
}

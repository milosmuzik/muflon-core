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

Pomocí web search najdi DALŠÍ, hlubší podrobnosti k tomuto tématu (konkrétní fakta, souvislosti, zajímavosti) — neopakuj to, co už víme výše. Dodržuj hierarchii zdrojů: 1) oficiální web, 2) oficiální sociální sítě, 3) archivní materiály, 4) hudební databáze, 5) hudební média, 6) rozhovory, 7) knihy. Wikipedii použij jen orientačně.

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
    return JSON.parse(ocistene.slice(start, konec + 1));
  } catch {
    return { rozsireni: "", zdroje: [] };
  }
}

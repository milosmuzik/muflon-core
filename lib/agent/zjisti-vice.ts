import { rozbalRedirect } from "./redirect";
import { geminiJeDostupne, GeminiQuotaError, vytahniJson, zavolejGemini } from "./gemini";

export type RozsireniVysledek = {
  rozsireni: string;
  zdroje: { nazev: string; url: string; kategorie: string }[];
};

export async function zjistiVice(nazev: string, znamyPopis: string | null): Promise<RozsireniVysledek> {
  if (!geminiJeDostupne()) throw new GeminiQuotaError();

  const prompt = `Jsi redakční asistent hudební databáze Rádio Muflon. K události "${nazev}" už máme tuto informaci: "${znamyPopis ?? "(zatím nic)"}"

Pomocí web search najdi DALŠÍ, hlubší podrobnosti k tomuto tématu (konkrétní fakta, souvislosti, zajímavosti) — neopakuj to, co už víme výše. Dodržuj hierarchii zdrojů: 1) oficiální web, 2) oficiální sociální sítě, 3) renomované hudební databáze/encyklopedie (Metal Archives/Encyclopaedia Metallum, AllMusic, Rate Your Music, Metal Storm), 4) dlouhodobě zavedená hudební média (Decibel, BraveWords, Kerrang!, Metal Hammer, Rock Hard, Spark Rock Magazine, Rock&Pop, BURRN!, Blabbermouth, Loudwire, Metal Injection, Angry Metal Guy, Revolver), 5) archivní materiály, 6) rozhovory, 7) knihy. Wikipedii a obecné databáze mimo výše uvedený seznam (Discogs, MusicBrainz) použij jen orientačně. Preferuj zdroje z bodů 1–4 – ty jediné stačí samy o sobě k automatickému schválení.

Vrať POUZE JSON (bez markdown):
{"rozsireni": "2-4 věty nových podrobností, vlastními slovy", "zdroje": [{"nazev": "...", "url": "https://...", "kategorie": "jedna z: oficialni_web|socialni_site|archivni|databaze|media|rozhovor|kniha|orientacni"}]}
Pokud nic nového ověřitelného nenajdeš, vrať {"rozsireni": "", "zdroje": []}.`;

  const surovyText = await zavolejGemini(prompt, true);
  const parsed = vytahniJson(surovyText) as RozsireniVysledek | null;
  if (!parsed) return { rozsireni: "", zdroje: [] };
  for (const zdroj of parsed.zdroje || []) {
    if (zdroj.url) zdroj.url = await rozbalRedirect(zdroj.url);
  }
  return { rozsireni: parsed.rozsireni ?? "", zdroje: parsed.zdroje ?? [] };
}

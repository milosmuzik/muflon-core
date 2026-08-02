const GEMINI_MODEL = "gemini-flash-lite-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export type ParsovanaKarta = {
  interpret: {
    nazev: string;
    zeme: string | null;
    mesto: string | null;
    rokVzniku: number | null;
    zanry: string | null;
    historie: string | null;
    redakcniVyznam: string | null;
    referencniId: string | null;
  };
  clenove: { jmeno: string; role: string | null; nastroj: string | null; obdobiOd: string | null; obdobiDo: string | null; poznamka: string | null }[];
  alba: { nazev: string; datumVydani: string | null; poznamka: string | null }[];
  udalosti: { nazev: string; datum: string; typ: string; popis: string | null }[];
  pribehy: { nadpis: string; obsah: string }[];
  zdroje: { nazev: string; url: string | null; kategorie: string }[];
  rozpory: string[];
};

const PROMPT_SABLONA = `Jsi datový extraktor pro hudební encyklopedii Rádia Muflon. Dostaneš neformátovaný text "referenční karty" interpreta/kapely (od uživatelova asistenta). Tvým úkolem je přesně, beze změny obsahu, převést tato data do JSON struktury níže.

Důležitá pravidla:
- Nic si nevymýšlej. Co v textu není, nech jako null nebo prázdné pole.
- Kategorie zdrojů urči SÁM podle skutečné domény URL, ne podle popisku v textu (např. Wikipedia je vždy "orientacni", i kdyby ji text označoval jako primární zdroj).
- Pokud si text sám protiřečí (např. dva různé roky u stejné události), zapiš to do pole "rozpory" jako čitelnou větu, a do hlavních dat vlož hodnotu, kterou text uvádí jako novější/opravenou (nebo první výskyt, pokud to nejde poznat).
- "typ" u události musí být jedna z: vyroci_alba, narozeniny, umrti, jina.
- "kategorie" u zdroje musí být jedna z: oficialni_web, socialni_site, archivni, databaze, media, rozhovor, kniha, orientacni.
- Datumová pole (obdobiOd, obdobiDo, datumVydani, datum) piš jako text přesně tak, jak je v datech (rok, nebo YYYY-MM-DD).

Vrať POUZE tento JSON objekt, žádný text okolo, žádné markdown zpětné uvozovky:
{
  "interpret": { "nazev": "", "zeme": null, "mesto": null, "rokVzniku": null, "zanry": null, "historie": null, "redakcniVyznam": null, "referencniId": null },
  "clenove": [{ "jmeno": "", "role": null, "nastroj": null, "obdobiOd": null, "obdobiDo": null, "poznamka": null }],
  "alba": [{ "nazev": "", "datumVydani": null, "poznamka": null }],
  "udalosti": [{ "nazev": "", "datum": "", "typ": "jina", "popis": null }],
  "pribehy": [{ "nadpis": "", "obsah": "" }],
  "zdroje": [{ "nazev": "", "url": null, "kategorie": "orientacni" }],
  "rozpory": []
}

TEXT KARTY:
"""
{{TEXT}}
"""`;

export async function parsovatKartu(text: string): Promise<ParsovanaKarta> {
  const apiKlic = process.env.GEMINI_API_KEY;
  if (!apiKlic) throw new Error("Chybí GEMINI_API_KEY.");

  const prompt = PROMPT_SABLONA.replace("{{TEXT}}", text.slice(0, 30000));

  const odpoved = await fetch(`${GEMINI_URL}?key=${apiKlic}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
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
  if (start === -1 || konec === -1) throw new Error("Gemini nevrátila platný JSON.");

  return JSON.parse(ocistene.slice(start, konec + 1));
}

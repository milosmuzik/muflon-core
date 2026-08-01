import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";

const GEMINI_MODEL = "gemini-flash-lite-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const NAZVY_MESICU_2P = [
  "ledna", "února", "března", "dubna", "května", "června",
  "července", "srpna", "září", "října", "listopadu", "prosince",
];

type NavrzenaUdalost = {
  nazev: string;
  typ: "vyroci_alba" | "narozeniny" | "umrti" | "jina";
  popis: string;
  zdroje: { nazev: string; url: string; kategorie: string }[];
};

const PLATNE_KATEGORIE = new Set([
  "oficialni_web", "socialni_site", "archivni", "databaze", "media", "rozhovor", "kniha", "orientacni",
]);

function sestavPrompt(den: number, mesic: number): string {
  const datumText = `${den}. ${NAZVY_MESICU_2P[mesic - 1]}`;
  return `Jsi redakční asistent hudební databáze Rádio Muflon (zaměření: rock a metal). Najdi ověřitelné hudební historické události vázané přesně na kalendářní datum ${datumText} (libovolný rok) – narození nebo úmrtí hudebníků, výročí založení kapel, výročí vydání alb, nebo zajímavosti (např. co se stalo na konkrétním koncertu tento den).

Použij web search a dodržuj tuto hierarchii důvěryhodnosti zdrojů (nejvyšší priorita první): 1) oficiální web interpreta, 2) oficiální sociální sítě, 3) bookletky/tiskoviny/archivy, 4) hudební databáze (AllMusic, Discogs, MusicBrainz), 5) hudební média (Loudwire, Blabbermouth, Metal Hammer, Kerrang!, Revolver), 6) rozhovory/ověřená videa, 7) knihy/biografie. Wikipedii a fanouškovské weby používej jen jako orientační bod, ne jako hlavní zdroj v odpovědi.

Vrať POUZE JSON pole (žádný text okolo, žádné markdown zpětné uvozovky) s max. 3 nejzajímavějšími a nejjistějšími položkami. Pokud nic ověřitelného nenajdeš, vrať prázdné pole []. Formát každé položky:
{"nazev": "krátký název (do 60 znaků)", "typ": "vyroci_alba|narozeniny|umrti|jina", "popis": "2-3 věty vlastními slovy, redakčně zpracované, ne opsané", "zdroje": [{"nazev": "název zdroje", "url": "https://...", "kategorie": "jedna z: oficialni_web|socialni_site|archivni|databaze|media|rozhovor|kniha|orientacni"}]}

Každá položka MUSÍ mít alespoň jeden zdroj se skutečnou, dohledatelnou URL. Bez zdroje položku vynech.`;
}

async function zavolejGemini(prompt: string, apiKlic: string): Promise<string> {
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
  const casti = data?.candidates?.[0]?.content?.parts ?? [];
  return casti.map((c: { text?: string }) => c.text ?? "").join("\n");
}

function vytahniJson(text: string): NavrzenaUdalost[] {
  const ocistene = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = ocistene.indexOf("[");
  const konec = ocistene.lastIndexOf("]");
  if (start === -1 || konec === -1) return [];
  try {
    const parsed = JSON.parse(ocistene.slice(start, konec + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export type VysledekAgenta = {
  zpracovanoDni: number;
  navrzeno: number;
  preskoceno: number;
  chyby: string[];
};

export async function vygenerovatNavrhyKalendare(pocetDni = 7): Promise<VysledekAgenta> {
  const apiKlic = process.env.GEMINI_API_KEY;
  if (!apiKlic) {
    throw new Error("Chybí GEMINI_API_KEY v proměnných prostředí.");
  }

  let navrzeno = 0;
  let preskoceno = 0;
  const chyby: string[] = [];

  console.log(`[agent] Start – zpracovávám ${pocetDni} dní dopředu.`);

  for (let i = 0; i < pocetDni; i++) {
    const datum = new Date();
    datum.setDate(datum.getDate() + i);
    const den = datum.getDate();
    const mesic = datum.getMonth() + 1;
    const mmdd = `${String(mesic).padStart(2, "0")}-${String(den).padStart(2, "0")}`;

    console.log(`[agent] Den ${mmdd}: volám Gemini...`);
    try {
      const surovaOdpoved = await zavolejGemini(sestavPrompt(den, mesic), apiKlic);
      console.log(`[agent] Den ${mmdd}: odpověď přijata (${surovaOdpoved.length} znaků).`);
      const polozky = vytahniJson(surovaOdpoved);
      console.log(`[agent] Den ${mmdd}: rozpoznáno ${polozky.length} položek v JSON.`);

      for (const polozka of polozky) {
        if (!polozka.nazev || !polozka.zdroje?.length) continue;

        const jizExistuje = await prisma.udalost.findFirst({
          where: { datum: mmdd, nazev: { contains: polozka.nazev.slice(0, 20), mode: "insensitive" } },
        });
        if (jizExistuje) {
          preskoceno++;
          continue;
        }

        const typ = ["vyroci_alba", "narozeniny", "umrti", "jina"].includes(polozka.typ) ? polozka.typ : "jina";

        const novaUdalost = await prisma.udalost.create({
          data: {
            nazev: polozka.nazev.slice(0, 200),
            typ,
            datum: mmdd,
            opakujeSe: true,
            popis: polozka.popis ?? null,
            stav: "navrh",
            zdrojAI: true,
            zverejnitNaSitich: false,
          },
        });

        for (const zdroj of polozka.zdroje.slice(0, 5)) {
          if (!zdroj.url) continue;
          await prisma.zdroj.create({
            data: {
              cilovyTyp: "Udalost",
              cilovyId: novaUdalost.id,
              nazev: zdroj.nazev || "Zdroj",
              url: zdroj.url,
              kategorie: PLATNE_KATEGORIE.has(zdroj.kategorie) ? zdroj.kategorie : "orientacni",
              uroverDuvery: "stredni",
              poznamka: "Navrženo AI agentem – doporučeno ověřit před zveřejněním.",
            },
          });
        }

        await zapisHistorii("Udalost", novaUdalost.id, "vytvoreno", "Navrženo AI agentem (Gemini + web search)");
        navrzeno++;
      }
    } catch (e) {
      console.error(`[agent] CHYBA den ${mmdd}:`, e);
      chyby.push(`${mmdd}: ${(e as Error).message}`);
    }
  }

  console.log(`[agent] Hotovo. Navrženo: ${navrzeno}, přeskočeno: ${preskoceno}, chyb: ${chyby.length}`);
  return { zpracovanoDni: pocetDni, navrzeno, preskoceno, chyby };
}

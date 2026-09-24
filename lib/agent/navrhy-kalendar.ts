import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import {
  AUTOSCHVALENI_OD_UROVNE,
  RENOMOVANE_ZDROJE_DOMENY,
  POZNAMKA_AI_NAVRH_KALENDAR,
  nazevZeZdroje,
  urovenDuveryPriorita,
  urovenDuveryZeZdroje,
} from "@/lib/constants";
import { jeGoogleRedirect, rozbalRedirect } from "./redirect";
import { jsouDuplicitni } from "./duplicity";
import { type GroundingZdroj, GeminiQuotaError, geminiJeDostupne, jeKvotaChyba, vytahniJson, zavolejGeminiSeZdroji } from "./gemini";
import { type RozpocetCasu, VYCHOZI_ROZPOCET_MS, vytvorRozpocet } from "@/lib/agent/rozpocet-casu";

const NAZVY_MESICU_2P = [
  "ledna", "února", "března", "dubna", "května", "června",
  "července", "srpna", "září", "října", "listopadu", "prosince",
];

const MAX_UDALOSTI_NA_DEN = 3;
const DNI_ZPETNE_KONTROLY = 5;
const MAX_DNI_DOPREDU = 14;
const STAVY_KTERE_PLNI_DEN = new Set(["navrh", "overeno", "schvaleno", "publikovano"]);

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

Použij web search a dodržuj hierarchii důvěryhodnosti zdrojů podle Muflon Core Bible (nejvyšší priorita první): 1) oficiální web interpreta, 2) oficiální sociální sítě interpreta, 3) bookletky, tiskoviny, archivy, 4) hudební databáze (Encyclopaedia Metallum, AllMusic, Rate Your Music, Metal Storm, Discogs, MusicBrainz), 5) hudební média, 6) rozhovory a ověřená videa, 7) knihy a biografie. Wikipedie a fanouškovské weby jsou jen orientační. Položka se přijme jen tehdy, když má aspoň jeden zdroj na oficiálním webu nebo oficiální sociální síti interpreta, nebo na některé z těchto domén: ${RENOMOVANE_ZDROJE_DOMENY.join(", ")}. Uváděj jen URL stránek, které jsi při vyhledávání skutečně našel – nevymýšlej je.

Vrať POUZE JSON pole (žádný text okolo, žádné markdown zpětné uvozovky) s max. 3 nejzajímavějšími a nejjistějšími položkami. Pokud nic ověřitelného nenajdeš, vrať prázdné pole []. Formát každé položky:
{"nazev": "krátký název (do 60 znaků)", "typ": "vyroci_alba|narozeniny|umrti|jina", "popis": "2-3 věty vlastními slovy, redakčně zpracované, ne opsané", "zdroje": [{"nazev": "název zdroje", "url": "https://...", "kategorie": "jedna z: oficialni_web|socialni_site|archivni|databaze|media|rozhovor|kniha|orientacni"}]}

Každá položka MUSÍ mít alespoň jeden zdroj se skutečnou, dohledatelnou URL. Bez zdroje položku vynech.`;
}

function vytahniPole(text: string): NavrzenaUdalost[] {
  const parsed = vytahniJson(text);
  return Array.isArray(parsed) ? parsed : [];
}

export type VysledekAgenta = {
  zpracovanoDni: number;
  navrzeno: number;
  preskoceno: number;
  bezDostatecnehoZdroje: number;
  /** Zdroje, které model uvedl, ale Google Search je při groundingu nenašel (pravděpodobně vymyšlené URL). */
  zamitnutoMimoGrounding: number;
  chyby: string[];
};

function normalizujHost(text: string): string | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  try {
    return new URL(t.includes("://") ? t : `https://${t}`).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Pochází URL, kterou model napsal do JSON, opravdu z výsledků Google Search?
 * Groundovací redirect musí přesně odpovídat některému z groundingChunks;
 * přímá URL musí ležet na doméně, kterou Google u některého chunku uvádí
 * v `title` (Google tam dává doménu zdroje). Bez grounding metadat se
 * nepřijme nic – radši žádná událost než vymyšlená.
 */
export function jeZGroundingu(url: string, grounding: GroundingZdroj[]): boolean {
  if (grounding.length === 0) return false;
  if (jeGoogleRedirect(url)) return grounding.some((g) => g.uri === url);
  const host = normalizujHost(url);
  if (!host) return false;
  return grounding.some((g) => {
    const h = normalizujHost(g.title);
    return Boolean(h) && (host === h || host.endsWith(`.${h}`) || (h as string).endsWith(`.${host}`));
  });
}

export async function vygenerovatNavrhyKalendare(
  pocetDniDopredu = 1,
  rozpocet: RozpocetCasu = vytvorRozpocet(VYCHOZI_ROZPOCET_MS)
): Promise<VysledekAgenta> {
  if (!geminiJeDostupne()) throw new GeminiQuotaError("Chybí GEMINI_API_KEY nebo je kvóta vyčerpaná.");

  const dopredu = Math.max(1, Math.min(pocetDniDopredu, MAX_DNI_DOPREDU));
  let navrzeno = 0;
  let preskoceno = 0;
  let bezDostatecnehoZdroje = 0;
  let zamitnutoMimoGrounding = 0;
  let zpracovanoDni = 0;
  const chyby: string[] = [];

  const offsety: number[] = [];
  for (let i = 1; i < dopredu; i++) offsety.push(i);
  offsety.push(0);
  for (let i = 1; i <= DNI_ZPETNE_KONTROLY; i++) offsety.push(-i);

  for (const offset of offsety) {
    if (rozpocet.vyprsel()) {
      chyby.push("Časový rozpočet vyčerpán, zbytek dní kalendáře přeskočen – doběhne příště.");
      break;
    }
    const datum = new Date();
    datum.setDate(datum.getDate() + offset);
    const den = datum.getDate();
    const mesic = datum.getMonth() + 1;
    const mmdd = `${String(mesic).padStart(2, "0")}-${String(den).padStart(2, "0")}`;
    zpracovanoDni++;
    try {
      const existujiciTentoDen = await prisma.udalost.findMany({
        where: { datum: mmdd },
        select: { nazev: true, stav: true },
      });
      const aktivni = existujiciTentoDen.filter((u) => STAVY_KTERE_PLNI_DEN.has(u.stav));
      if (aktivni.length >= MAX_UDALOSTI_NA_DEN) {
        preskoceno += aktivni.length;
        continue;
      }
      const odpoved = await zavolejGeminiSeZdroji(sestavPrompt(den, mesic), { hledat: true, maxVystup: 700 }, rozpocet);
      const polozky = vytahniPole(odpoved.text);
      for (const polozka of polozky) {
        if (rozpocet.vyprsel()) {
          chyby.push(`${mmdd}: časový rozpočet vyčerpán uprostřed dne, zbytek položek přeskočen.`);
          break;
        }
        if (!polozka.nazev || !polozka.zdroje?.length) continue;
        if (existujiciTentoDen.some((u) => jsouDuplicitni(u.nazev, polozka.nazev))) {
          preskoceno++;
          continue;
        }
        if (aktivni.length >= MAX_UDALOSTI_NA_DEN) break;
        const typ = ["vyroci_alba", "narozeniny", "umrti", "jina"].includes(polozka.typ) ? polozka.typ : "jina";
        const vyhodnoceneZdroje: { nazev: string; url: string; kategorie: string; uroverDuvery: string }[] = [];
        let nejvyssiUroven = 0;
        for (const zdroj of polozka.zdroje.slice(0, 5)) {
          if (rozpocet.vyprsel()) break;
          if (!zdroj.url) continue;
          if (!jeZGroundingu(zdroj.url, odpoved.zdroje)) {
            zamitnutoMimoGrounding++;
            continue;
          }
          const skutecnaUrl = await rozbalRedirect(zdroj.url, rozpocet);
          const kategorie = PLATNE_KATEGORIE.has(zdroj.kategorie) ? zdroj.kategorie : "orientacni";
          const uroverDuvery = urovenDuveryZeZdroje(kategorie, skutecnaUrl);
          nejvyssiUroven = Math.max(nejvyssiUroven, urovenDuveryPriorita(uroverDuvery));
          vyhodnoceneZdroje.push({
            nazev: nazevZeZdroje(skutecnaUrl, zdroj.nazev || "Zdroj"),
            url: skutecnaUrl,
            kategorie,
            uroverDuvery,
          });
        }
        if (nejvyssiUroven < AUTOSCHVALENI_OD_UROVNE) {
          bezDostatecnehoZdroje++;
          continue;
        }
        const novaUdalost = await prisma.udalost.create({
          data: {
            nazev: polozka.nazev.slice(0, 200),
            typ,
            datum: mmdd,
            opakujeSe: true,
            popis: polozka.popis ?? null,
            stav: "schvaleno",
            zdrojAI: true,
            zverejnitNaSitich: false,
          },
        });
        existujiciTentoDen.push({ nazev: novaUdalost.nazev, stav: "schvaleno" });
        aktivni.push({ nazev: novaUdalost.nazev, stav: "schvaleno" });
        for (const zdroj of vyhodnoceneZdroje) {
          await prisma.zdroj.create({
            data: {
              cilovyTyp: "Udalost",
              cilovyId: novaUdalost.id,
              nazev: zdroj.nazev,
              url: zdroj.url,
              kategorie: zdroj.kategorie,
              uroverDuvery: zdroj.uroverDuvery,
              poznamka: POZNAMKA_AI_NAVRH_KALENDAR,
            },
          });
        }
        await zapisHistorii("Udalost", novaUdalost.id, "vytvoreno", "Navrženo AI agentem (web search)");
        await zapisHistorii("Udalost", novaUdalost.id, "zmena_stavu", "Automaticky schváleno (whitelist) – nejméně jeden zdroj z Google Search s vysokou důvěrou");
        navrzeno++;
      }
    } catch (e) {
      chyby.push(`${mmdd}: ${(e as Error).message}`);
      if (jeKvotaChyba(e)) break;
    }
  }

  return { zpracovanoDni, navrzeno, preskoceno, bezDostatecnehoZdroje, zamitnutoMimoGrounding, chyby };
}

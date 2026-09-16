import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { RENOMOVANE_ZDROJE_DOMENY } from "@/lib/constants";
import { GeminiQuotaError, geminiJeDostupne, jeKvotaChyba, vytahniJson, zavolejGemini } from "@/lib/agent/gemini";
import { type RozpocetCasu, VYCHOZI_ROZPOCET_MS, vytvorRozpocet } from "@/lib/agent/rozpocet-casu";

export type VysledekPribehu = {
  zeSablony: number;
  zGemini: number;
  preskoceno: number;
  zbyva: number;
  chyby: string[];
};

async function maPribeh(interpretId: string): Promise<boolean> {
  const vazba = await prisma.vazba.findFirst({
    where: { zdrojovyTyp: "Pribeh", cilovyTyp: "Interpret", cilovyId: interpretId },
  });
  return Boolean(vazba);
}

async function ulozPribeh(interpretId: string, nazev: string, nadpis: string, obsah: string, stav: string) {
  const p = await prisma.pribeh.create({
    data: { nadpis, obsah, stav },
  });
  await prisma.vazba.create({
    data: {
      zdrojovyTyp: "Pribeh",
      zdrojovyId: p.id,
      cilovyTyp: "Interpret",
      cilovyId: interpretId,
      typVztahu: "o_interpretovi",
    },
  });
  await zapisHistorii("Pribeh", p.id, "vytvoreno", `Příběh pro ${nazev}`);
}

type KandidatBezHistorie = { id: string; nazev: string };
type NapsanyPribeh = { nadpis: string; obsah: string };

// Nižší než u dohledávání zdrojů (10) – jeden vyžádaný příběh vrací v odpovědi
// mnohem víc textu než jedna URL, takže dávka musí být menší, aby se výstup
// vešel do rozumného maxOutputTokens.
const MAX_POLOZEK_V_DAVCE = 8;

function sestavPribehPrompt(polozky: KandidatBezHistorie[]): string {
  const seznamZdroju = RENOMOVANE_ZDROJE_DOMENY.join(", ");
  const seznamPolozek = polozky.map((p) => `- klic="${p.id}": ${p.nazev}`).join("\n");
  return `Jsi redakční autor Encyklopedie Rádia Muflon (zaměření: rock a metal), píšeš pro sekci "Příběhy vhodné pro Mufloní kalendář".

Pro KAŽDOU kapelu/interpreta níž (podle "klic") pomocí web search zkus najít JEDEN krátký, ověřený a doložitelný příběh nebo zajímavou historku z její historie – ne obecný životopis, ale konkrétní událost, moment nebo zajímavost použitelná samostatně jako krátký text ke zveřejnění.

Kapely:
${seznamPolozek}

Použij POUZE ověřitelné zdroje: oficiální web/sociální síť interpreta, nebo záznam na jedné z těchto renomovaných domén (databáze i média, redakčně odsouhlasený seznam): ${seznamZdroju}. Žádné domněnky, odhady ani obecně známá "prý" tvrzení. Pokud pro danou kapelu nic takového ověřeného nenajdeš, u ní vrať nalezeno: false – radši nic, než vymyšlené nebo neověřené tvrzení.

Vrať POUZE JSON pole (žádný text okolo, žádné markdown zpětné uvozovky), jednu položku pro KAŽDÝ zadaný "klic":
[{"klic": "...", "nalezeno": true, "nadpis": "krátký úderný název příběhu", "obsah": "text příběhu, 2-5 vět, česky"}, {"klic": "...", "nalezeno": false}]`;
}

/**
 * Dávkově napíše chybějící příběhy přes groundovaného Gemini – stejný vzor
 * jako dohledatZdrojeVDavce (dohledat-zdroj.ts): jeden groundovaný prompt na
 * víc položek místo jednoho volání na kapelu. Vrací mapu id -> napsaný
 * příběh (nebo null, pokud Gemini nic ověřeného nenašel). Položky, ke
 * kterým se kvůli časovému rozpočtu vůbec nedošlo, v mapě chybí úplně (na
 * rozdíl od `null`) – volající to nesmí považovat za "zkusili jsme a nic se
 * nenašlo", protože o žádnou existující data se tu nejedná (jen se
 * nezaloží nový návrh příběhu, nic se nemaže).
 */
async function napisPribehyDavkou(
  polozky: KandidatBezHistorie[],
  rozpocet: RozpocetCasu
): Promise<Map<string, NapsanyPribeh | null>> {
  const vysledek = new Map<string, NapsanyPribeh | null>();
  if (polozky.length === 0) return vysledek;
  if (!geminiJeDostupne()) throw new GeminiQuotaError();

  for (let i = 0; i < polozky.length; i += MAX_POLOZEK_V_DAVCE) {
    if (rozpocet.vyprsel()) break;
    const davka = polozky.slice(i, i + MAX_POLOZEK_V_DAVCE);
    const surovyText = await zavolejGemini(
      sestavPribehPrompt(davka),
      { hledat: true, maxVystup: 500 + davka.length * 260 },
      rozpocet
    );
    const pole = vytahniJson(surovyText);
    if (!Array.isArray(pole)) continue;

    for (const polozka of pole as {
      klic?: string;
      nalezeno?: boolean;
      nadpis?: string;
      obsah?: string;
    }[]) {
      if (!polozka?.klic) continue;
      const obsah = String(polozka.obsah ?? "").trim();
      if (!polozka.nalezeno || obsah.length < 40) {
        vysledek.set(polozka.klic, null);
        continue;
      }
      const nadpisFallback = davka.find((d) => d.id === polozka.klic)?.nazev ?? "";
      vysledek.set(polozka.klic, {
        nadpis: (String(polozka.nadpis ?? "").trim() || nadpisFallback).slice(0, 200),
        obsah: obsah.slice(0, 2000),
      });
    }
  }

  return vysledek;
}

export async function doplnitChybejiciPribehy(
  limit = 10,
  rozpocet: RozpocetCasu = vytvorRozpocet(VYCHOZI_ROZPOCET_MS)
): Promise<VysledekPribehu> {
  const chyby: string[] = [];
  let zeSablony = 0;
  let zGemini = 0;
  let preskoceno = 0;

  if (rozpocet.vyprsel()) {
    return { zeSablony, zGemini, preskoceno, zbyva: 0, chyby };
  }

  const vPlaylistu = await prisma.skladbaInterpret.findMany({
    where: { skladba: { vPlaylistu: true } },
    select: { interpretId: true },
    distinct: ["interpretId"],
  });
  const ids = vPlaylistu.map((x) => x.interpretId);

  const interpreti = await prisma.interpret.findMany({
    where: { id: { in: ids } },
    orderBy: { nazev: "asc" },
    select: { id: true, nazev: true, historie: true, zeme: true, rokVzniku: true },
  });

  const bez: typeof interpreti = [];
  for (const i of interpreti) {
    if (await maPribeh(i.id)) continue;
    bez.push(i);
  }

  const davka = bez.slice(0, limit);
  const naGemini: typeof davka = [];

  for (const i of davka) {
    if (rozpocet.vyprsel()) {
      chyby.push("Časový rozpočet vyčerpán, zbytek dávky příběhů přeskočen (doběhne příště).");
      break;
    }
    const historie = i.historie?.trim() ?? "";
    if (historie.length >= 80) {
      try {
        await ulozPribeh(i.id, i.nazev, i.nazev, historie.slice(0, 4000), "schvaleno");
        zeSablony++;
      } catch (e) {
        chyby.push(`${i.nazev}: ${(e as Error).message}`);
      }
      continue;
    }
    naGemini.push(i);
  }

  if (naGemini.length > 0 && !rozpocet.vyprsel()) {
    try {
      const napsane = await napisPribehyDavkou(naGemini.map((i) => ({ id: i.id, nazev: i.nazev })), rozpocet);
      for (const i of naGemini) {
        if (!napsane.has(i.id)) continue; // časový rozpočet - nezpracováno, zkusí se příště
        const napsany = napsane.get(i.id);
        if (!napsany) {
          preskoceno++;
          continue;
        }
        // Na rozdíl od kopie z už ověřeného pole "historie" jde o čerstvě
        // vygenerovaný text – zůstává ve stavu "navrh", ať ho stávající
        // krok dohledatChybejiciZdroje (kontrola.ts) nejdřív podloží
        // zdrojem, případně smaže, pokud žádný nenajde.
        try {
          await ulozPribeh(i.id, i.nazev, napsany.nadpis, napsany.obsah, "navrh");
          zGemini++;
        } catch (e) {
          chyby.push(`${i.nazev}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      preskoceno += naGemini.length;
      chyby.push(
        jeKvotaChyba(e)
          ? "Gemini kvóta vyčerpaná – psaní příběhů přeskočeno, zkus to znovu příště."
          : `Psaní příběhů přes Gemini selhalo: ${(e as Error).message}`
      );
    }
  }

  return {
    zeSablony,
    zGemini,
    preskoceno,
    zbyva: Math.max(0, bez.length - davka.length),
    chyby: chyby.slice(-8),
  };
}

"use server";

import { prisma } from "@/lib/prisma";
import { parsovatKartu } from "@/lib/agent/import-karty";
import { zapisHistorii } from "@/lib/history";
import { revalidatePath } from "next/cache";

const PLATNE_KATEGORIE = new Set(["oficialni_web", "socialni_site", "archivni", "databaze", "media", "rozhovor", "kniha", "orientacni"]);
const PLATNE_TYPY_UDALOSTI = new Set(["vyroci_alba", "narozeniny", "umrti", "jina"]);

export type VysledekImportu = {
  chyba: string | null;
  interpretNazev: string | null;
  interpretId: string | null;
  novyChlenu: number;
  novaAlba: number;
  noveUdalosti: number;
  novePribehy: number;
  noveZdroje: number;
  urovenKarty: string | null;
  rozpory: string[];
  varovaniHudebnici: string[];
};

const PRAZDNY_VYSLEDEK: VysledekImportu = {
  chyba: null, interpretNazev: null, interpretId: null,
  novyChlenu: 0, novaAlba: 0, noveUdalosti: 0, novePribehy: 0, noveZdroje: 0,
  urovenKarty: null, rozpory: [], varovaniHudebnici: [],
};

export async function importovatKartu(_predchoziStav: VysledekImportu, formData: FormData): Promise<VysledekImportu> {
  const text = String(formData.get("text") || "").trim();
  if (!text) return { ...PRAZDNY_VYSLEDEK, chyba: "Vlož text karty." };

  let karta;
  try {
    karta = await parsovatKartu(text);
  } catch (e) {
    return { ...PRAZDNY_VYSLEDEK, chyba: `Chyba při zpracování AI: ${(e as Error).message}` };
  }

  if (!karta.interpret?.nazev) {
    return { ...PRAZDNY_VYSLEDEK, chyba: "AI nerozpoznala název interpreta v textu." };
  }

  // AI se občas neřídí přesně schématem (pole místo textu, text místo čísla) - normalizace.
  if (Array.isArray(karta.interpret.zanry)) {
    karta.interpret.zanry = (karta.interpret.zanry as unknown as string[]).join(", ");
  }
  if (karta.interpret.rokVzniku != null && typeof karta.interpret.rokVzniku !== "number") {
    const cislo = parseInt(String(karta.interpret.rokVzniku).replace(/\D/g, ""), 10);
    karta.interpret.rokVzniku = Number.isFinite(cislo) ? cislo : null;
  }
  for (const c of karta.clenove || []) {
    if (Array.isArray((c as any).nastroj)) (c as any).nastroj = ((c as any).nastroj as string[]).join(", ");
  }

  let interpret = await prisma.interpret.findFirst({ where: { nazev: karta.interpret.nazev } });
  if (!interpret) interpret = await prisma.interpret.create({ data: { nazev: karta.interpret.nazev } });

  const maUrl = (karta.zdroje || []).some((z) => z.url);
  await prisma.interpret.update({
    where: { id: interpret.id },
    data: {
      zeme: karta.interpret.zeme ?? undefined,
      mesto: karta.interpret.mesto ?? undefined,
      rokVzniku: karta.interpret.rokVzniku ?? undefined,
      zanry: karta.interpret.zanry ?? undefined,
      historie: karta.interpret.historie ?? undefined,
      redakcniVyznam: karta.interpret.redakcniVyznam ?? undefined,
      referencniId: karta.interpret.referencniId ?? undefined,
      urovenKarty: maUrl ? "referencni" : "navrh",
    },
  });

  let novyChlenu = 0;
  const varovaniHudebnici: string[] = [];
  for (const c of karta.clenove || []) {
    if (!c.jmeno) continue;
    const existujiciHudebnik = await prisma.hudebnik.findFirst({ where: { jmeno: c.jmeno } });
    if (existujiciHudebnik) {
      const uJinehoInterpreta = await prisma.clenstvi.findFirst({
        where: { hudebnikId: existujiciHudebnik.id, interpretId: { not: interpret.id } },
      });
      if (uJinehoInterpreta) varovaniHudebnici.push(c.jmeno);
    }
    const hudebnik = existujiciHudebnik ?? (await prisma.hudebnik.create({ data: { jmeno: c.jmeno } }));
    const existujeClenstvi = await prisma.clenstvi.findFirst({
      where: { hudebnikId: hudebnik.id, interpretId: interpret.id, obdobiOd: c.obdobiOd, obdobiDo: c.obdobiDo },
    });
    if (!existujeClenstvi) {
      await prisma.clenstvi.create({
        data: { hudebnikId: hudebnik.id, interpretId: interpret.id, role: c.role, nastroj: c.nastroj, obdobiOd: c.obdobiOd, obdobiDo: c.obdobiDo, poznamka: c.poznamka },
      });
      novyChlenu++;
    }
  }

  let novaAlba = 0;
  for (const a of karta.alba || []) {
    if (!a.nazev) continue;
    let album = await prisma.album.findFirst({ where: { nazev: a.nazev } });
    if (!album) album = await prisma.album.create({ data: { nazev: a.nazev, datumVydani: a.datumVydani, poznamka: a.poznamka } });
    const existujeVazba = await prisma.albumInterpret.findFirst({ where: { albumId: album.id, interpretId: interpret.id } });
    if (!existujeVazba) {
      await prisma.albumInterpret.create({ data: { albumId: album.id, interpretId: interpret.id } });
      novaAlba++;
    }
  }

  let noveUdalosti = 0;
  for (const u of karta.udalosti || []) {
    if (!u.nazev || !u.datum) continue;
    const existuje = await prisma.udalost.findFirst({ where: { nazev: u.nazev } });
    if (!existuje) {
      // stav zůstává na výchozím "navrh" – karta zatím nemá zdroj přiřazený
      // konkrétně k téhle události (viz komentář u pribehy níže).
      await prisma.udalost.create({
        data: { nazev: u.nazev, datum: u.datum, typ: PLATNE_TYPY_UDALOSTI.has(u.typ) ? u.typ : "jina", opakujeSe: true, popis: u.popis },
      });
      noveUdalosti++;
    }
  }

  let novePribehy = 0;
  for (const p of karta.pribehy || []) {
    if (!p.nadpis || !p.obsah) continue;
    let pribeh = await prisma.pribeh.findFirst({ where: { nadpis: p.nadpis } });
    if (!pribeh) {
      // stav zůstává na výchozím "navrh": zdroje z karty (karta.zdroje) se
      // vážou jen k interpretovi, ne ke konkrétnímu příběhu, takže tenhle
      // příběh sám o sobě zatím žádný zdroj nemá (kap. 4.4 Ověřitelnost).
      pribeh = await prisma.pribeh.create({ data: { nadpis: p.nadpis, obsah: p.obsah } });
      novePribehy++;
    }
    const existujeVazba = await prisma.vazba.findFirst({
      where: { zdrojovyTyp: "Pribeh", zdrojovyId: pribeh.id, cilovyTyp: "Interpret", cilovyId: interpret.id },
    });
    if (!existujeVazba) {
      await prisma.vazba.create({
        data: { zdrojovyTyp: "Pribeh", zdrojovyId: pribeh.id, cilovyTyp: "Interpret", cilovyId: interpret.id, typVztahu: "vypráví o" },
      });
    }
  }

  let noveZdroje = 0;
  for (const z of karta.zdroje || []) {
    if (!z.nazev) continue;
    const existuje = await prisma.zdroj.findFirst({
      where: { cilovyTyp: "Interpret", cilovyId: interpret.id, OR: [{ url: z.url ?? undefined }, { nazev: z.nazev }] },
    });
    if (!existuje) {
      await prisma.zdroj.create({
        data: {
          cilovyTyp: "Interpret", cilovyId: interpret.id, nazev: z.nazev, url: z.url,
          kategorie: PLATNE_KATEGORIE.has(z.kategorie) ? z.kategorie : "orientacni",
          uroverDuvery: z.url ? "vysoka" : "stredni",
        },
      });
      noveZdroje++;
    }
  }

  await zapisHistorii("Interpret", interpret.id, "upraveno", "Naimportováno přes AI import karty");
  revalidatePath(`/interpreti/${interpret.id}`);
  revalidatePath("/interpreti");
  revalidatePath("/pribehy");
  revalidatePath("/kontrola");

  return {
    chyba: null,
    interpretNazev: interpret.nazev,
    interpretId: interpret.id,
    novyChlenu, novaAlba, noveUdalosti, novePribehy, noveZdroje,
    urovenKarty: maUrl ? "referencni" : "navrh",
    rozpory: karta.rozpory || [],
    varovaniHudebnici,
  };
}

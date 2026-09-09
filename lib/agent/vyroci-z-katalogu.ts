import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";
import { jsouDuplicitni } from "@/lib/agent/duplicity";
import { urovenDuveryZeZdroje } from "@/lib/constants";
import { faktaZMusicBrainzAlbum, faktaZMusicBrainzHudebnik } from "@/lib/agent/databaze";

export function parsujDatum(s: string | null | undefined): { mmdd?: string; rok?: number } {
  if (!s) return {};
  const t = s.trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { mmdd: `${iso[2]}-${iso[3]}`, rok: Number(iso[1]) };
  const cz = t.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (cz) {
    return {
      mmdd: `${cz[2].padStart(2, "0")}-${cz[1].padStart(2, "0")}`,
      rok: Number(cz[3]),
    };
  }
  const rok = t.match(/^(\d{4})\b/);
  if (rok) return { rok: Number(rok[1]) };
  return {};
}

async function uzExistuje(nazev: string, mmdd: string): Promise<boolean> {
  const stejnyDen = await prisma.udalost.findMany({
    where: { datum: mmdd },
    select: { nazev: true },
  });
  return stejnyDen.some((u) => jsouDuplicitni(u.nazev, nazev));
}

async function vytvorVyroci(args: {
  nazev: string;
  typ: "vyroci_alba" | "narozeniny" | "umrti";
  mmdd: string;
  popis: string;
  interpretId?: string;
  zdrojNazev?: string;
  zdrojUrl?: string;
  kategorie?: string;
  stav?: string;
}) {
  if (await uzExistuje(args.nazev, args.mmdd)) return false;

  const kategorie = args.kategorie ?? "databaze";
  const urover = urovenDuveryZeZdroje(kategorie, args.zdrojUrl ?? null);
  const stav = args.stav ?? (urover === "vysoka" ? "schvaleno" : "overeno");

  const u = await prisma.udalost.create({
    data: {
      nazev: args.nazev.slice(0, 200),
      typ: args.typ,
      datum: args.mmdd,
      opakujeSe: true,
      popis: args.popis,
      stav,
      zdrojAI: false,
    },
  });

  if (args.interpretId) {
    await prisma.vazba.create({
      data: {
        zdrojovyTyp: "Udalost",
        zdrojovyId: u.id,
        cilovyTyp: "Interpret",
        cilovyId: args.interpretId,
        typVztahu: "tyka_se",
      },
    });
  }

  if (args.zdrojNazev) {
    await prisma.zdroj.create({
      data: {
        cilovyTyp: "Udalost",
        cilovyId: u.id,
        nazev: args.zdrojNazev,
        url: args.zdrojUrl ?? null,
        kategorie,
        uroverDuvery: urover,
        poznamka: "Odvozeno z katalogu / databáze, bez AI.",
      },
    });
  }

  await zapisHistorii("Udalost", u.id, "vytvoreno", "Výročí z katalogu");
  return true;
}

export type VysledekVyroci = {
  alba: number;
  hudebnici: number;
  doplnenaData: number;
  preskoceno: number;
  chyby: string[];
};

export async function doplnitVyrociZKatalogu(limitMb = 6): Promise<VysledekVyroci> {
  const chyby: string[] = [];
  let alba = 0;
  let hudebnici = 0;
  let doplnenaData = 0;
  let preskoceno = 0;

  const albaSDatem = await prisma.album.findMany({
    where: { datumVydani: { not: null } },
    include: { interpreti: { include: { interpret: true } } },
  });

  for (const album of albaSDatem) {
    const d = parsujDatum(album.datumVydani);
    if (!d.mmdd) {
      preskoceno++;
      continue;
    }
    const interpret = album.interpreti[0]?.interpret;
    const kdo = interpret?.nazev ?? "Kapela";
    const nazev = `${kdo} vydali album ${album.nazev}`;
    const rok = d.rok ? ` (${d.rok})` : "";
    try {
      const ok = await vytvorVyroci({
        nazev,
        typ: "vyroci_alba",
        mmdd: d.mmdd,
        popis: `${kdo} vydali album ${album.nazev}${rok}.`,
        interpretId: interpret?.id,
        zdrojNazev: "Katalog Muflon Core",
        kategorie: "databaze",
        stav: "schvaleno",
      });
      if (ok) alba++;
      else preskoceno++;
    } catch (e) {
      chyby.push((e as Error).message);
    }
  }

  const lide = await prisma.hudebnik.findMany({
    where: { OR: [{ datumNarozeni: { not: null } }, { datumUmrti: { not: null } }] },
    include: { clenstvi: { include: { interpret: true }, take: 1 } },
  });

  for (const h of lide) {
    const interpret = h.clenstvi[0]?.interpret;
    const narozeni = parsujDatum(h.datumNarozeni);
    if (narozeni.mmdd) {
      try {
        const ok = await vytvorVyroci({
          nazev: `Narozeniny: ${h.jmeno}`,
          typ: "narozeniny",
          mmdd: narozeni.mmdd,
          popis: `${h.jmeno}${narozeni.rok ? ` se narodil/a roku ${narozeni.rok}` : " má narozeniny"}.`,
          interpretId: interpret?.id,
          zdrojNazev: "Katalog Muflon Core",
          kategorie: "databaze",
          stav: "schvaleno",
        });
        if (ok) hudebnici++;
        else preskoceno++;
      } catch (e) {
        chyby.push((e as Error).message);
      }
    }
    const umrti = parsujDatum(h.datumUmrti);
    if (umrti.mmdd) {
      try {
        const ok = await vytvorVyroci({
          nazev: `Úmrtí: ${h.jmeno}`,
          typ: "umrti",
          mmdd: umrti.mmdd,
          popis: `${h.jmeno}${umrti.rok ? ` zemřel/a roku ${umrti.rok}` : " — výročí úmrtí"}.`,
          interpretId: interpret?.id,
          zdrojNazev: "Katalog Muflon Core",
          kategorie: "databaze",
          stav: "schvaleno",
        });
        if (ok) hudebnici++;
        else preskoceno++;
      } catch (e) {
        chyby.push((e as Error).message);
      }
    }
  }

  const albaBezDne = await prisma.album.findMany({
    where: { OR: [{ datumVydani: null }, { datumVydani: { equals: "" } }] },
    include: { interpreti: { include: { interpret: true } } },
    take: limitMb,
  });

  for (const album of albaBezDne) {
    const interpret = album.interpreti[0]?.interpret;
    try {
      const fakta = await faktaZMusicBrainzAlbum(album.nazev, interpret?.nazev);
      const d = parsujDatum(fakta?.datumVydani);
      if (!d.mmdd && !fakta?.datumVydani) continue;
      if (fakta?.datumVydani && !album.datumVydani) {
        await prisma.album.update({
          where: { id: album.id },
          data: {
            datumVydani: fakta.datumVydani,
            vydavatel: album.vydavatel ?? fakta.vydavatel ?? null,
          },
        });
        doplnenaData++;
      }
      if (d.mmdd && interpret) {
        const ok = await vytvorVyroci({
          nazev: `${interpret.nazev} vydali album ${album.nazev}`,
          typ: "vyroci_alba",
          mmdd: d.mmdd,
          popis: `${interpret.nazev} vydali album ${album.nazev}${d.rok ? ` (${d.rok})` : ""}.`,
          interpretId: interpret.id,
          zdrojNazev: fakta?.zdroj?.nazev ?? "MusicBrainz",
          zdrojUrl: fakta?.zdroj?.url,
          kategorie: "databaze",
          stav: "overeno",
        });
        if (ok) alba++;
      }
    } catch (e) {
      chyby.push(`${album.nazev}: ${(e as Error).message}`);
    }
  }

  const lideBezDne = await prisma.hudebnik.findMany({
    where: { datumNarozeni: null },
    include: { clenstvi: { include: { interpret: true }, take: 1 } },
    take: Math.max(2, Math.floor(limitMb / 2)),
  });

  for (const h of lideBezDne) {
    try {
      const fakta = await faktaZMusicBrainzHudebnik(h.jmeno);
      const d = parsujDatum(fakta?.datumNarozeni);
      if (fakta?.datumNarozeni && !h.datumNarozeni) {
        await prisma.hudebnik.update({
          where: { id: h.id },
          data: {
            datumNarozeni: fakta.datumNarozeni,
            datumUmrti: h.datumUmrti ?? fakta.datumUmrti ?? null,
          },
        });
        doplnenaData++;
      }
      if (d.mmdd) {
        const ok = await vytvorVyroci({
          nazev: `Narozeniny: ${h.jmeno}`,
          typ: "narozeniny",
          mmdd: d.mmdd,
          popis: `${h.jmeno}${d.rok ? ` se narodil/a roku ${d.rok}` : " má narozeniny"}.`,
          interpretId: h.clenstvi[0]?.interpret.id,
          zdrojNazev: fakta?.zdroj?.nazev ?? "MusicBrainz",
          zdrojUrl: fakta?.zdroj?.url,
          kategorie: "databaze",
          stav: "overeno",
        });
        if (ok) hudebnici++;
      }
    } catch (e) {
      chyby.push(`${h.jmeno}: ${(e as Error).message}`);
    }
  }

  return { alba, hudebnici, doplnenaData, preskoceno, chyby: chyby.slice(-12) };
}

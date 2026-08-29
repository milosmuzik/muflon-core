import { PrismaClient } from "@prisma/client";
import { POZNAMKA_MB_CLENSTVI, urovenDuveryZeZdroje } from "../lib/constants";

const prisma = new PrismaClient();

const USER_AGENT = "MuflonCore/0.1 (kontakt: tvuj-email@example.com)";
const MB_ZAKLAD = "https://musicbrainz.org/ws/2";

const PAUZA_MS = 1100;
function pauza(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type MbArtistHit = {
  id: string;
  name: string;
  type?: string;
  score: number;
};

type MbRelation = {
  type: string;
  begin: string | null;
  end: string | null;
  attributes?: string[];
  artist?: { id: string; name: string };
};

async function mbFetch(cesta: string) {
  const odpoved = await fetch(`${MB_ZAKLAD}${cesta}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!odpoved.ok) {
    throw new Error(`MusicBrainz ${odpoved.status} pro ${cesta}`);
  }
  return odpoved.json();
}

async function najdiArtista(nazev: string): Promise<MbArtistHit | null> {
  const dotaz = encodeURIComponent(`artist:"${nazev}"`);
  const data = await mbFetch(`/artist/?query=${dotaz}&fmt=json&limit=5`);
  const hity: MbArtistHit[] = data.artists ?? [];

  const presna = hity.find(
    (h) => h.name.toLowerCase() === nazev.toLowerCase() && h.score >= 90
  );
  return presna ?? null;
}

async function nactiClenyKapely(mbid: string): Promise<MbRelation[]> {
  const data = await mbFetch(`/artist/${mbid}?inc=artist-rels&fmt=json`);
  const vztahy: MbRelation[] = data.relations ?? [];
  return vztahy.filter((v) => v.type === "member of band" && v.artist);
}

async function main() {
  const limit = Number(process.argv[2]) || undefined;
  const vsichniInterpreti = await prisma.interpret.findMany({
    orderBy: { nazev: "asc" },
    include: { _count: { select: { clenstvi: true } } },
  });

  const kZpracovani = vsichniInterpreti
    .filter((i) => i._count.clenstvi === 0)
    .slice(0, limit);

  console.log(`Ke zpracování: ${kZpracovani.length} interpretů (z celkem ${vsichniInterpreti.length}).`);

  let nalezeno = 0;
  let bezShody: string[] = [];
  let chyby: string[] = [];

  for (const interpret of kZpracovani) {
    try {
      const hit = await najdiArtista(interpret.nazev);
      await pauza(PAUZA_MS);

      if (!hit) {
        bezShody.push(interpret.nazev);
        continue;
      }

      const clenoveVztahy = await nactiClenyKapely(hit.id);
      await pauza(PAUZA_MS);

      if (clenoveVztahy.length === 0) {
        bezShody.push(`${interpret.nazev} (nalezen na MusicBrainz, ale bez záznamu členů)`);
        continue;
      }

      for (const vztah of clenoveVztahy) {
        if (!vztah.artist) continue;
        let hudebnik = await prisma.hudebnik.findFirst({ where: { jmeno: vztah.artist.name } });
        if (!hudebnik) {
          hudebnik = await prisma.hudebnik.create({ data: { jmeno: vztah.artist.name } });
        }

        await prisma.clenstvi.create({
          data: {
            hudebnikId: hudebnik.id,
            interpretId: interpret.id,
            nastroj: vztah.attributes?.join(", ") || null,
            obdobiOd: vztah.begin,
            obdobiDo: vztah.end,
            poznamka: POZNAMKA_MB_CLENSTVI,
          },
        });
      }

      // Stejná politika důvěry jako u AI agentů (lib/constants.ts) – MusicBrainz
      // je obecná databáze mimo redakční whitelist, takže "střední", nikdy
      // "vysoká" (na tu potřebuje oficiální kanál interpreta nebo renomované
      // médium/databázi z whitelistu). Odvozeno funkcí, ne napevno zadané, aby
      // to zůstalo v souladu, i kdyby se politika/whitelist později změnily.
      const mbUrl = `https://musicbrainz.org/artist/${hit.id}`;
      await prisma.zdroj.create({
        data: {
          cilovyTyp: "Interpret",
          cilovyId: interpret.id,
          nazev: "MusicBrainz",
          url: mbUrl,
          kategorie: "databaze",
          uroverDuvery: urovenDuveryZeZdroje("databaze", mbUrl),
          poznamka: "Automatický import sestavy. Zkontroluj a případně dopřesni.",
        },
      });

      nalezeno++;
      console.log(`✓ ${interpret.nazev} — ${clenoveVztahy.length} členů`);
    } catch (e) {
      chyby.push(`${interpret.nazev}: ${(e as Error).message}`);
      console.log(`✗ chyba u ${interpret.nazev}: ${(e as Error).message}`);
    }
  }

  console.log("\n--- Shrnutí ---");
  console.log(`Doplněno interpretů: ${nalezeno}`);
  console.log(`Bez jisté shody: ${bezShody.length}`);
  console.log(`Chyby: ${chyby.length}`);

  if (bezShody.length > 0) {
    console.log("\nInterpreti bez jisté shody (doplň ručně na jejich stránce):");
    bezShody.forEach((n) => console.log(" - " + n));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

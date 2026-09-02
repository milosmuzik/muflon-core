/**
 * Jednorázová oprava záměny dvou kapel Vanaheim.
 *
 * Rádio Muflon hraje český Vanaheim (Chlumec nad Cidlinou, Devět světů).
 * Do pole historie se omylem dostala bio nizozemského Vanaheimu z Tilburgu
 * (Een Verloren Verhaal, Fireflash, Zino van Leerdam).
 *
 *   npx tsx prisma/oprava-vanaheim.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const HOLANDSKE_STOPY = [
  /tilburg/i,
  /nizozem/i,
  /nederland/i,
  /netherlands/i,
  /een verloren verhaal/i,
  /roede voor de borst/i,
  /fireflash/i,
  /zino van leerdam/i,
  /rikke linssen/i,
  /the house spirit/i,
];

const CESKE_STOPY_SKLADBA = [
  /devět světů/i,
  /za obzor/i,
  /jörmungandr/i,
  /jormungandr/i,
  /drakkar/i,
  /fenrir/i,
  /král vikingů/i,
  /amulet/i,
  /zlatí rytíři/i,
];

const HISTORIE_CZ = `Česká kapela Vanaheim vznikla v prosinci 2015 v Chlumci nad Cidlinou. Od začátku spojuje energický heavy a power metal s vikingskou a severskou tematikou, texty jsou v češtině. Jméno si kapela vypůjčila ze severské mytologie – Vanaheim je jeden z devíti světů a domov bohů Vanů, spojovaných s plodností, moudrostí a přírodou.

Zakladateli byli bubeník Libor Král a kytarista Martin Drobný, záhy přibyl baskytarista Radek Hladík a zpěvák Radek Drobný. Debutové CD Věčná sláva vyšlo v lednu 2017, poté deska Zlatí rytíři (2018). Po úrazu původního zpěváka přišel Miloš Koblmüller a kapela se výrazněji stočila k vikingskému metalu: EP Křížem proti meči (2020) a album Amulet (2021). Následovaly singly Jörmungandr, Fenrir, HEL a Devět světů.

Zlomem je koncepční album Devět světů (vydání 21. března 2026), pokřtěné v chlumecké sokolovně při oslavě deseti let kapely. Klipy k Devět světů a Drakkar se točily v Norsku (Bergen, ostrov Halsnøy). Kapela hrála na Metalfestu, Masters of Rock a The Legends Rock Fest.`;

function jeHolandskaBio(text: string | null): boolean {
  if (!text) return false;
  return HOLANDSKE_STOPY.some((r) => r.test(text));
}

async function main() {
  const interpreti = await prisma.interpret.findMany({
    where: { nazev: { equals: "Vanaheim", mode: "insensitive" } },
    include: {
      skladby: { include: { skladba: true } },
      alba: { include: { album: true } },
    },
  });

  if (interpreti.length === 0) {
    console.log("Interpret Vanaheim nenalezen.");
    return;
  }

  console.log(`Nalezeno záznamů Vanaheim: ${interpreti.length}`);

  for (const interpret of interpreti) {
    const nazvy = [
      ...interpret.skladby.map((s) => s.skladba.nazev),
      ...interpret.alba.map((a) => a.album.nazev),
    ].join(" | ");
    const ceskyRepertoar = CESKE_STOPY_SKLADBA.some((r) => r.test(nazvy));
    const holandskaBio = jeHolandskaBio(interpret.historie) || jeHolandskaBio(interpret.poznamka);
    const vypadaJakoHolandskyZaznam =
      /nizozem|netherlands|tilburg/i.test(`${interpret.zeme ?? ""} ${interpret.mesto ?? ""}`) && !ceskyRepertoar;

    console.log(`\nID ${interpret.id}`);
    console.log(`  země/město: ${interpret.zeme ?? "—"} / ${interpret.mesto ?? "—"}`);
    console.log(`  český repertoár: ${ceskyRepertoar}`);
    console.log(`  holandská bio: ${holandskaBio}`);

    if (vypadaJakoHolandskyZaznam) {
      console.log("  Přeskočeno — samostatný nizozemský záznam, nesahej.");
      continue;
    }

    if (!holandskaBio && interpret.zeme === "Česko" && interpret.mesto === "Chlumec nad Cidlinou") {
      console.log("  Už vypadá správně.");
      continue;
    }

    const po = await prisma.interpret.update({
      where: { id: interpret.id },
      data: {
        zeme: "Česko",
        mesto: "Chlumec nad Cidlinou",
        rokVzniku: interpret.rokVzniku ?? 2015,
        zanry: interpret.zanry ?? "heavy metal, power metal, viking metal",
        historie: HISTORIE_CZ,
        poznamka: [
          interpret.poznamka,
          "Opraveno 2026-09-02: oddělen český Vanaheim od nizozemského Vanaheimu (Tilburg).",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    });

    await prisma.historieZmeny.create({
      data: {
        entitaTyp: "Interpret",
        entitaId: po.id,
        akce: "upraveno",
        popis:
          "Oprava záměny se stejným názvem: historie nizozemského Vanaheimu nahrazena českou kapelou z Chlumce nad Cidlinou.",
      },
    });

    console.log("  Opraveno na český Vanaheim (Chlumec nad Cidlinou).");
  }
}

main()
  .catch((e) => {
    console.error("Chyba:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

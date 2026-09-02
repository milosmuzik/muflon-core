/**
 * Jednorázová oprava záměny dvou kapel Vanaheim v databázi.
 * Veřejné API opraví výstup i bez tohoto skriptu.
 *
 *   npx tsx prisma/oprava-vanaheim.ts
 */

import { PrismaClient } from "@prisma/client";
import {
  jeCeskyVanaheimRepertoar,
  jeHolandskyVanaheimText,
  VANAHEIM_HISTORIE_CZ,
} from "../lib/homonyma/vanaheim";

const prisma = new PrismaClient();

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
    const ceskyRepertoar = jeCeskyVanaheimRepertoar(nazvy);
    const holandskaBio =
      jeHolandskyVanaheimText(interpret.historie) || jeHolandskyVanaheimText(interpret.poznamka);
    const vypadaJakoHolandskyZaznam =
      /nizozem|netherlands|tilburg/i.test(`${interpret.zeme ?? ""} ${interpret.mesto ?? ""}`) &&
      !ceskyRepertoar;

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
        historie: VANAHEIM_HISTORIE_CZ,
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

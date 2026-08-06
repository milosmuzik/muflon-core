import { prisma } from "@/lib/prisma";

const INTERPRET = "Adelitas Way";
const ALBUM = "";

const SKLADBY = [
  "Alive",
  "Bad Reputation",
  "Cage the Beast",
  "Invincible",
  "Notorious",
  "Ready for War (Pray for Peace)",
  "Sick",
  "The Collapse",
];

async function main() {
  let interpret = await prisma.interpret.findFirst({ where: { nazev: INTERPRET } });
  if (!interpret) interpret = await prisma.interpret.create({ data: { nazev: INTERPRET } });

  let albumId: string | null = null;
  if (ALBUM) {
    const album = await prisma.album.findFirst({ where: { nazev: ALBUM } });
    albumId = album?.id ?? null;
  }

  let pridano = 0, preskoceno = 0;
  for (const nazev of SKLADBY) {
    let skladba = await prisma.skladba.findFirst({ where: { nazev, albumId } });
    if (!skladba) {
      skladba = await prisma.skladba.create({ data: { nazev, albumId, vPlaylistu: true } });
      pridano++;
      console.log(`  + přidána: ${nazev}`);
    } else {
      preskoceno++;
      console.log(`  - přeskočena (existuje): ${nazev}`);
    }
    const vazba = await prisma.skladbaInterpret.findFirst({ where: { skladbaId: skladba.id, interpretId: interpret.id } });
    if (!vazba) await prisma.skladbaInterpret.create({ data: { skladbaId: skladba.id, interpretId: interpret.id } });
  }
  console.log(`\nHotovo. Přidáno: ${pridano}, přeskočeno: ${preskoceno}.`);
}

main().finally(() => prisma.$disconnect());

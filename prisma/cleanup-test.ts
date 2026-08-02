import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const smazanaClenstvi = await prisma.clenstvi.deleteMany({
    where: { poznamka: { contains: "Automaticky doplněno z MusicBrainz" } },
  });
  const smazaneZdroje = await prisma.zdroj.deleteMany({
    where: { poznamka: { contains: "Automatický import sestavy" } },
  });
  // smaž hudebníky, kteří teď nemají žádné členství (osiřelí po úklidu)
  const vsichni = await prisma.hudebnik.findMany({ include: { _count: { select: { clenstvi: true } } } });
  const osireli = vsichni.filter((h) => h._count.clenstvi === 0);
  const smazaniHudebnici = await prisma.hudebnik.deleteMany({
    where: { id: { in: osireli.map((h) => h.id) } },
  });

  console.log(`Smazáno členství: ${smazanaClenstvi.count}`);
  console.log(`Smazáno zdrojů: ${smazaneZdroje.count}`);
  console.log(`Smazáno osiřelých hudebníků: ${smazaniHudebnici.count}`);
}

main().finally(() => prisma.$disconnect());

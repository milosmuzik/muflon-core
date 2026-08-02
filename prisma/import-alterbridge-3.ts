import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const ab = await prisma.interpret.findFirst({ where: { nazev: "Alter Bridge" } });
  if (!ab) throw new Error("Alter Bridge nenalezen");

  // smaž předchozí zdroje bez URL, nahradíme je přesnými odkazy
  await prisma.zdroj.deleteMany({ where: { cilovyTyp: "Interpret", cilovyId: ab.id, url: null } });

  const zdroje = [
    { nazev: "Oficiální web Alter Bridge", url: "https://alterbridge.com/", kategorie: "oficialni_web", duvera: "vysoka" },
    { nazev: "Diskografie Alter Bridge (Wikipedia)", url: "https://en.wikipedia.org/wiki/Alter_Bridge_discography", kategorie: "orientacni", duvera: "stredni" },
    { nazev: "Historie kapely (Wikipedia)", url: "https://en.wikipedia.org/wiki/Alter_Bridge", kategorie: "orientacni", duvera: "stredni" },
    { nazev: "Oficiální turné Alter Bridge", url: "https://alterbridge.com/pages/tour", kategorie: "oficialni_web", duvera: "vysoka" },
  ];
  for (const z of zdroje) {
    const existuje = await prisma.zdroj.findFirst({ where: { cilovyTyp: "Interpret", cilovyId: ab.id, url: z.url } });
    if (!existuje) {
      await prisma.zdroj.create({
        data: { cilovyTyp: "Interpret", cilovyId: ab.id, nazev: z.nazev, url: z.url, kategorie: z.kategorie, uroverDuvery: z.duvera },
      });
    }
  }

  // Teď má karta reálné odkazy - povyšuji na referenční
  await prisma.interpret.update({ where: { id: ab.id }, data: { urovenKarty: "referencni" } });

  console.log("Alter Bridge - zdroje doplněny o URL, karta povýšena na referenční.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

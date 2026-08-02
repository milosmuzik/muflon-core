import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const MAPOVANI: { nadpis: string; interpret: string }[] = [
  { nadpis: "Vznik kapely Kabát", interpret: "Kabát" },
  { nadpis: "Debut, který všechno změnil", interpret: "Kabát" },
  { nadpis: "Turné Dole v dole", interpret: "Kabát" },
  { nadpis: "Koncert na Vypichu", interpret: "Kabát" },
  { nadpis: "Kabát na Eurovision Song Contest", interpret: "Kabát" },
  { nadpis: "Zrození Alter Bridge z popela Creed", interpret: "Alter Bridge" },
  { nadpis: "Blackbird a nejlepší kytarové sólo", interpret: "Alter Bridge" },
  { nadpis: "Alter Bridge – stabilní sestava přes dvě dekády", interpret: "Alter Bridge" },
  { nadpis: "Album Pawns & Kings", interpret: "Alter Bridge" },
  { nadpis: "Alter Bridge na Rádiu Muflon", interpret: "Alter Bridge" },
  { nadpis: "12 Stones: z garáže ke smlouvě během 15 měsíců", interpret: "12 Stones" },
  { nadpis: "Paul McCoy a světový hit Evanescence", interpret: "12 Stones" },
  { nadpis: "Hudba 12 Stones ve filmech a WWE", interpret: "12 Stones" },
  { nadpis: "Hurikán Katrina ovlivnil album Anthem for the Underdog", interpret: "12 Stones" },
];

async function main() {
  let propojeno = 0;
  let chybi = 0;

  for (const m of MAPOVANI) {
    const pribeh = await prisma.pribeh.findFirst({ where: { nadpis: m.nadpis } });
    const interpret = await prisma.interpret.findFirst({ where: { nazev: m.interpret } });

    if (!pribeh || !interpret) {
      console.log(`✗ nenalezeno: příběh "${m.nadpis}" nebo interpret "${m.interpret}"`);
      chybi++;
      continue;
    }

    const existuje = await prisma.vazba.findFirst({
      where: { zdrojovyTyp: "Pribeh", zdrojovyId: pribeh.id, cilovyTyp: "Interpret", cilovyId: interpret.id },
    });
    if (existuje) continue;

    await prisma.vazba.create({
      data: {
        zdrojovyTyp: "Pribeh",
        zdrojovyId: pribeh.id,
        cilovyTyp: "Interpret",
        cilovyId: interpret.id,
        typVztahu: "vypráví o",
      },
    });
    propojeno++;
  }

  console.log(`\nHOTOVO. Nově propojeno: ${propojeno}, chybějících záznamů: ${chybi}.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

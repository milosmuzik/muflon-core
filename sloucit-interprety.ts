import { prisma } from "@/lib/prisma";

const SPATNY_NAZEV = "Æther Realm";
const SPRAVNY_NAZEV = "Aether Realm";

async function main() {
  const spatny = await prisma.interpret.findFirst({ where: { nazev: SPATNY_NAZEV } });
  const spravny = await prisma.interpret.findFirst({ where: { nazev: SPRAVNY_NAZEV } });

  if (!spatny) {
    console.log(`Interpret "${SPATNY_NAZEV}" nenalezen - není co slučovat.`);
    return;
  }
  if (!spravny) {
    console.log(`Interpret "${SPRAVNY_NAZEV}" nenalezen - nejdřív ověř přesný název.`);
    return;
  }
  if (spatny.id === spravny.id) {
    console.log("Oba názvy ukazují na stejný záznam, nic k sloučení.");
    return;
  }

  console.log(`Slučuji "${SPATNY_NAZEV}" (${spatny.id}) do "${SPRAVNY_NAZEV}" (${spravny.id})...`);

  // Členství
  const clenstvi = await prisma.clenstvi.findMany({ where: { interpretId: spatny.id } });
  for (const c of clenstvi) {
    const existuje = await prisma.clenstvi.findFirst({
      where: { hudebnikId: c.hudebnikId, interpretId: spravny.id, obdobiOd: c.obdobiOd, obdobiDo: c.obdobiDo },
    });
    if (existuje) {
      await prisma.clenstvi.delete({ where: { id: c.id } });
    } else {
      await prisma.clenstvi.update({ where: { id: c.id }, data: { interpretId: spravny.id } });
    }
  }
  console.log(`  clenstvi: ${clenstvi.length} zpracováno`);

  // Alba
  const alba = await prisma.albumInterpret.findMany({ where: { interpretId: spatny.id } });
  for (const a of alba) {
    const existuje = await prisma.albumInterpret.findFirst({
      where: { albumId: a.albumId, interpretId: spravny.id },
    });
    if (existuje) {
      await prisma.albumInterpret.delete({ where: { id: a.id } });
    } else {
      await prisma.albumInterpret.update({ where: { id: a.id }, data: { interpretId: spravny.id } });
    }
  }
  console.log(`  alba: ${alba.length} zpracováno`);

  // Skladby
  const skladby = await prisma.skladbaInterpret.findMany({ where: { interpretId: spatny.id } });
  for (const s of skladby) {
    const existuje = await prisma.skladbaInterpret.findFirst({
      where: { skladbaId: s.skladbaId, interpretId: spravny.id },
    });
    if (existuje) {
      await prisma.skladbaInterpret.delete({ where: { id: s.id } });
    } else {
      await prisma.skladbaInterpret.update({ where: { id: s.id }, data: { interpretId: spravny.id } });
    }
  }
  console.log(`  skladby: ${skladby.length} zpracováno`);

  // Zdroje (polymorfní vazba cilovyTyp/cilovyId)
  const zdroje = await prisma.zdroj.updateMany({
    where: { cilovyTyp: "Interpret", cilovyId: spatny.id },
    data: { cilovyId: spravny.id },
  });
  console.log(`  zdroje: ${zdroje.count} přepojeno`);

  // Vazby (příběhy, události - polymorfní cilovyTyp/cilovyId)
  const vazbyJakoCil = await prisma.vazba.updateMany({
    where: { cilovyTyp: "Interpret", cilovyId: spatny.id },
    data: { cilovyId: spravny.id },
  });
  const vazbyJakoZdroj = await prisma.vazba.updateMany({
    where: { zdrojovyTyp: "Interpret", zdrojovyId: spatny.id },
    data: { zdrojovyId: spravny.id },
  });
  console.log(`  vazby: ${vazbyJakoCil.count + vazbyJakoZdroj.count} přepojeno`);

  // Smazání starého (špatného) záznamu interpreta
  await prisma.interpret.delete({ where: { id: spatny.id } });
  console.log(`\nHotovo. "${SPATNY_NAZEV}" smazán, vše přesunuto pod "${SPRAVNY_NAZEV}".`);
}

main()
  .catch((e) => console.error("Chyba:", e))
  .finally(() => prisma.$disconnect());

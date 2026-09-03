// prisma/smazat-interpreta.ts
//
// Bezpečně smaže interpreta (i více duplicitních záznamů se stejným názvem)
// včetně VŠECH navázaných dat: Clenstvi, AlbumInterpret, SkladbaInterpret,
// Zdroj (polymorfní), Vazba (polymorfní) a navázané Pribeh/Udalost/Hudebnik/
// Album/Skladba objekty - ale POUZE pokud jsou "osiřelé", tedy nejsou
// sdílené s jiným interpretem, který nemažeme.
//
// Princip je stejný jako u audit-duplicity-udalosti.ts / merge-duplicity-*.ts:
//   - výchozí režim je DRY-RUN (jen vypíše, co by se smazalo)
//   - `--provest` provede reálné smazání v jedné transakci
//   - u sdílených/nejednoznačných věcí vypíše ⚠️ a NIC nesmaže (bezpečnější
//     je nechat ručně zkontrolovat, než smazat něco, co patří i jinam)
//
// Použití:
//   npx tsx prisma/smazat-interpreta.ts            (dry-run)
//   npx tsx prisma/smazat-interpreta.ts --provest   (reálné smazání)
//
// Před spuštěním uprav NAZEV_KE_SMAZANI, pokud nejde o "Vanaheim".

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const NAZEV_KE_SMAZANI = "Vanaheim";
const PROVEST = process.argv.includes("--provest");

async function main() {
  console.log(`\n=== Mazání interpreta "${NAZEV_KE_SMAZANI}" ===`);
  console.log(PROVEST ? "Režim: PROVEDU REÁLNÉ SMAZÁNÍ\n" : "Režim: DRY-RUN (nic se nesmaže)\n");

  // 1) Najdi všechny interprety s tímto názvem (case-insensitive, přesná shoda)
  const interpreti = await prisma.interpret.findMany({
    where: { nazev: { equals: NAZEV_KE_SMAZANI, mode: "insensitive" } },
  });

  if (interpreti.length === 0) {
    console.log("Žádný interpret s tímto názvem nenalezen. Konec.");
    return;
  }

  console.log(`Nalezeno záznamů Interpret: ${interpreti.length}`);
  for (const i of interpreti) {
    console.log(`  - [${i.id}] "${i.nazev}" | zeme=${i.zeme ?? "-"} | rokVzniku=${i.rokVzniku ?? "-"} | stav=${i.stav}`);
  }
  const targetIds = interpreti.map((i) => i.id);

  // 2) Přímé vazby (přes cizí klíče)
  const clenstvi = await prisma.clenstvi.findMany({
    where: { interpretId: { in: targetIds } },
    include: { hudebnik: true },
  });
  const albumInterpret = await prisma.albumInterpret.findMany({
    where: { interpretId: { in: targetIds } },
    include: { album: true },
  });
  const skladbaInterpret = await prisma.skladbaInterpret.findMany({
    where: { interpretId: { in: targetIds } },
    include: { skladba: true },
  });

  // 3) Polymorfní vazby
  const zdrojeInterpret = await prisma.zdroj.findMany({
    where: { cilovyTyp: "Interpret", cilovyId: { in: targetIds } },
  });
  const vazbyInterpret = await prisma.vazba.findMany({
    where: {
      OR: [
        { zdrojovyTyp: "Interpret", zdrojovyId: { in: targetIds } },
        { cilovyTyp: "Interpret", cilovyId: { in: targetIds } },
      ],
    },
  });

  // Z vazeb vytáhni "druhou stranu" (typicky Pribeh, Udalost, jiný Hudebnik/Interpret)
  type Ref = { typ: string; id: string };
  const druhaStrana: Ref[] = [];
  for (const v of vazbyInterpret) {
    if (v.zdrojovyTyp === "Interpret" && targetIds.includes(v.zdrojovyId)) {
      druhaStrana.push({ typ: v.cilovyTyp, id: v.cilovyId });
    } else if (v.cilovyTyp === "Interpret" && targetIds.includes(v.cilovyId)) {
      druhaStrana.push({ typ: v.zdrojovyTyp, id: v.zdrojovyId });
    }
  }
  const pribehIds = [...new Set(druhaStrana.filter((r) => r.typ === "Pribeh").map((r) => r.id))];
  const udalostIds = [...new Set(druhaStrana.filter((r) => r.typ === "Udalost").map((r) => r.id))];

  const hudebnikIds = [...new Set(clenstvi.map((c) => c.hudebnikId))];
  const albumIds = [...new Set(albumInterpret.map((a) => a.albumId))];
  const skladbaIds = [...new Set(skladbaInterpret.map((s) => s.skladbaId))];

  // 4) Zjisti, co je "osiřelé" (nesdílené s jiným interpretem/vazbou mimo cíl)

  // Hudebníci: členové jiné kapely než ty mazané?
  const orphanHudebnikIds: string[] = [];
  const keptHudebnik: string[] = [];
  for (const hid of hudebnikIds) {
    const jinde = await prisma.clenstvi.count({
      where: { hudebnikId: hid, interpretId: { notIn: targetIds } },
    });
    if (jinde === 0) orphanHudebnikIds.push(hid);
    else keptHudebnik.push(hid);
  }

  // Skladby: patří i jinému interpretovi (např. feat.)?
  const orphanSkladbaIds: string[] = [];
  const keptSkladba: string[] = [];
  for (const sid of skladbaIds) {
    const jinde = await prisma.skladbaInterpret.count({
      where: { skladbaId: sid, interpretId: { notIn: targetIds } },
    });
    if (jinde === 0) orphanSkladbaIds.push(sid);
    else keptSkladba.push(sid);
  }

  // Alba: patří i jinému interpretovi, NEBO na ně ještě odkazuje skladba,
  // kterou nemažeme (keptSkladba)?
  const orphanAlbumIds: string[] = [];
  const keptAlbum: string[] = [];
  for (const aid of albumIds) {
    const jindeInterpret = await prisma.albumInterpret.count({
      where: { albumId: aid, interpretId: { notIn: targetIds } },
    });
    const zbyvajiciSkladby = await prisma.skladba.count({
      where: { albumId: aid, id: { notIn: [...orphanSkladbaIds] } },
    });
    if (jindeInterpret === 0 && zbyvajiciSkladby === 0) orphanAlbumIds.push(aid);
    else keptAlbum.push(aid);
  }

  // Příběhy: existuje jiná Vazba na tento příběh, která nesouvisí s mazaným interpretem?
  const orphanPribehIds: string[] = [];
  const keptPribeh: string[] = [];
  for (const pid of pribehIds) {
    const jinde = await prisma.vazba.count({
      where: {
        OR: [
          { zdrojovyTyp: "Pribeh", zdrojovyId: pid, NOT: { cilovyTyp: "Interpret", cilovyId: { in: targetIds } } },
          { cilovyTyp: "Pribeh", cilovyId: pid, NOT: { zdrojovyTyp: "Interpret", zdrojovyId: { in: targetIds } } },
        ],
      },
    });
    if (jinde === 0) orphanPribehIds.push(pid);
    else keptPribeh.push(pid);
  }

  // Události: totéž
  const orphanUdalostIds: string[] = [];
  const keptUdalost: string[] = [];
  for (const uid of udalostIds) {
    const jinde = await prisma.vazba.count({
      where: {
        OR: [
          { zdrojovyTyp: "Udalost", zdrojovyId: uid, NOT: { cilovyTyp: "Interpret", cilovyId: { in: targetIds } } },
          { cilovyTyp: "Udalost", cilovyId: uid, NOT: { zdrojovyTyp: "Interpret", zdrojovyId: { in: targetIds } } },
        ],
      },
    });
    if (jinde === 0) orphanUdalostIds.push(uid);
    else keptUdalost.push(uid);
  }

  // 5) Report
  console.log(`\n--- Přímo navázáno ---`);
  console.log(`Clenstvi (členství): ${clenstvi.length}`);
  console.log(`AlbumInterpret: ${albumInterpret.length} (alb celkem: ${albumIds.length})`);
  console.log(`SkladbaInterpret: ${skladbaInterpret.length} (skladeb celkem: ${skladbaIds.length})`);
  console.log(`Zdroj (u Interpret): ${zdrojeInterpret.length}`);
  console.log(`Vazba (u Interpret): ${vazbyInterpret.length}`);

  console.log(`\n--- Ke smazání (osiřelé, nesdílené) ---`);
  console.log(`Hudebníci: ${orphanHudebnikIds.length}`);
  for (const hid of orphanHudebnikIds) {
    const h = clenstvi.find((c) => c.hudebnikId === hid)?.hudebnik;
    console.log(`  - ${h?.jmeno ?? hid}`);
  }
  console.log(`Alba: ${orphanAlbumIds.length}`);
  for (const aid of orphanAlbumIds) {
    const a = albumInterpret.find((x) => x.albumId === aid)?.album;
    console.log(`  - ${a?.nazev ?? aid}`);
  }
  console.log(`Skladby: ${orphanSkladbaIds.length}`);
  for (const sid of orphanSkladbaIds) {
    const s = skladbaInterpret.find((x) => x.skladbaId === sid)?.skladba;
    console.log(`  - ${s?.nazev ?? sid}`);
  }
  console.log(`Příběhy: ${orphanPribehIds.length}`);
  console.log(`Události: ${orphanUdalostIds.length}`);

  if (keptHudebnik.length || keptAlbum.length || keptSkladba.length || keptPribeh.length || keptUdalost.length) {
    console.log(`\n--- ⚠️ PONECHÁNO (sdíleno i mimo mazaný záznam, zkontroluj ručně) ---`);
    if (keptHudebnik.length) console.log(`Hudebníci (jsou i v jiné kapele): ${keptHudebnik.length}`);
    if (keptAlbum.length) console.log(`Alba (patří i jinam / mají jiné skladby): ${keptAlbum.length}`);
    if (keptSkladba.length) console.log(`Skladby (feat./sdílené s jiným interpretem): ${keptSkladba.length}`);
    if (keptPribeh.length) console.log(`Příběhy (mají i jinou vazbu): ${keptPribeh.length}`);
    if (keptUdalost.length) console.log(`Události (mají i jinou vazbu): ${keptUdalost.length}`);
  }

  if (!PROVEST) {
    console.log(`\nDry-run hotovo. Pro reálné smazání spusť s --provest.`);
    return;
  }

  // 6) Reálné smazání v transakci, v bezpečném pořadí
  console.log(`\nMažu...`);
  await prisma.$transaction(async (tx) => {
    // Zdroj - vše polymorfně navázané na to, co mažeme
    await tx.zdroj.deleteMany({ where: { cilovyTyp: "Interpret", cilovyId: { in: targetIds } } });
    if (orphanPribehIds.length)
      await tx.zdroj.deleteMany({ where: { cilovyTyp: "Pribeh", cilovyId: { in: orphanPribehIds } } });
    if (orphanUdalostIds.length)
      await tx.zdroj.deleteMany({ where: { cilovyTyp: "Udalost", cilovyId: { in: orphanUdalostIds } } });
    if (orphanHudebnikIds.length)
      await tx.zdroj.deleteMany({ where: { cilovyTyp: "Hudebnik", cilovyId: { in: orphanHudebnikIds } } });
    if (orphanAlbumIds.length)
      await tx.zdroj.deleteMany({ where: { cilovyTyp: "Album", cilovyId: { in: orphanAlbumIds } } });
    if (orphanSkladbaIds.length)
      await tx.zdroj.deleteMany({ where: { cilovyTyp: "Skladba", cilovyId: { in: orphanSkladbaIds } } });

    // Vazba - vše, co se dotýká mazaného interpreta nebo osiřelých entit
    const vsechnyOsireleIdy = [...orphanPribehIds, ...orphanUdalostIds, ...orphanHudebnikIds, ...orphanAlbumIds, ...orphanSkladbaIds, ...targetIds];
    await tx.vazba.deleteMany({
      where: {
        OR: [
          { zdrojovyId: { in: vsechnyOsireleIdy } },
          { cilovyId: { in: vsechnyOsireleIdy } },
        ],
      },
    });

    // Osiřelé entity - skladby před alby (FK Skladba.albumId -> Album.id)
    if (orphanSkladbaIds.length) await tx.skladba.deleteMany({ where: { id: { in: orphanSkladbaIds } } });
    if (orphanAlbumIds.length) await tx.album.deleteMany({ where: { id: { in: orphanAlbumIds } } });
    if (orphanPribehIds.length) await tx.pribeh.deleteMany({ where: { id: { in: orphanPribehIds } } });
    if (orphanUdalostIds.length) await tx.udalost.deleteMany({ where: { id: { in: orphanUdalostIds } } });
    if (orphanHudebnikIds.length) await tx.hudebnik.deleteMany({ where: { id: { in: orphanHudebnikIds } } });

    // Nakonec samotný Interpret - kaskádově smaže zbylé Clenstvi/AlbumInterpret/SkladbaInterpret
    await tx.interpret.deleteMany({ where: { id: { in: targetIds } } });
  });

  console.log(`Hotovo. Smazáno ${targetIds.length} záznamů Interpret "${NAZEV_KE_SMAZANI}" a navázaná osiřelá data.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

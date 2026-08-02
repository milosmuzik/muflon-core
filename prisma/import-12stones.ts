import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  let interpret = await prisma.interpret.findFirst({ where: { nazev: "12 Stones" } });
  if (!interpret) interpret = await prisma.interpret.create({ data: { nazev: "12 Stones" } });

  await prisma.interpret.update({
    where: { id: interpret.id },
    data: {
      rokVzniku: 2000,
      zeme: "Spojené státy americké",
      mesto: "Mandeville, Louisiana",
      zanry: "Post-grunge, Hard rock, Alternative metal, Christian rock",
      historie:
        "12 Stones je americká rocková kapela založená v roce 2000 v Louisianě. Mezinárodní pozornost získala zejména díky zpěvákovi Paulu McCoyovi, který hostoval ve skladbě Bring Me to Life skupiny Evanescence. Hudba kapely kombinuje tvrdé kytary, melodické refrény a moderní hard rock.",
      referencniId: "US-12STONES-2000-001",
      urovenKarty: "referencni",
    },
  });

  const skutecneSkladby = await prisma.skladba.findMany({
    where: { interpreti: { some: { interpretId: interpret.id } } },
    select: { nazev: true },
  });
  const tvrzeneOdChatGPT = ["Adrenaline", "Anthem for the Underdog", "Anywhere but Here", "Broken", "Far Away", "Lie to Me", "Sever"];
  const skutecnaJmena = new Set(skutecneSkladby.map((s) => s.nazev));
  const chybejiVAppce = tvrzeneOdChatGPT.filter((n) => !skutecnaJmena.has(n));
  const chybejiUChatGPT = [...skutecnaJmena].filter((n) => !tvrzeneOdChatGPT.includes(n));

  console.log("--- Kontrola playlistu 12 Stones ---");
  console.log(`V appce skutečně: ${[...skutecnaJmena].join(", ") || "(nic)"}`);
  if (chybejiVAppce.length > 0) console.log(`ChatGPT tvrdí, ale v appce chybí: ${chybejiVAppce.join(", ")}`);
  if (chybejiUChatGPT.length > 0) console.log(`V appce je navíc oproti ChatGPT: ${chybejiUChatGPT.join(", ")}`);
  if (chybejiVAppce.length === 0 && chybejiUChatGPT.length === 0) console.log("Shoda - žádný rozpor.");

  type Clen = { jmeno: string; nastroj: string; obdobiOd: string; obdobiDo: string | null; zakladajici?: boolean };
  const clenove: Clen[] = [
    { jmeno: "Paul McCoy", nastroj: "hlavní zpěv", obdobiOd: "2000", obdobiDo: null, zakladajici: true },
    { jmeno: "Jon Rodriguez", nastroj: "sólová kytara, doprovodný zpěv", obdobiOd: "2025", obdobiDo: null },
    { jmeno: "Richard Labranche", nastroj: "rytmická kytara", obdobiOd: "2025", obdobiDo: null },
    { jmeno: "Brian Selleck", nastroj: "baskytara", obdobiOd: "2025", obdobiDo: null },
    { jmeno: "Sean Dunaway", nastroj: "bicí", obdobiOd: "2014", obdobiDo: null },
    { jmeno: "Eric Weaver", nastroj: "sólová kytara, doprovodný zpěv", obdobiOd: "2000", obdobiDo: "2025", zakladajici: true },
    { jmeno: "Kevin Dorr", nastroj: "baskytara", obdobiOd: "2000", obdobiDo: "2004", zakladajici: true },
    { jmeno: "Kevin Dorr", nastroj: "baskytara", obdobiOd: "2009", obdobiDo: "2011" },
    { jmeno: "Aaron Gainer", nastroj: "bicí", obdobiOd: "2000", obdobiDo: "2010", zakladajici: true },
    { jmeno: "Aaron Gainer", nastroj: "bicí", obdobiOd: "2012", obdobiDo: "2014" },
    { jmeno: "Greg Trammell", nastroj: "rytmická kytara", obdobiOd: "2003", obdobiDo: "2007" },
    { jmeno: "Justin Rimer", nastroj: "rytmická kytara", obdobiOd: "2007", obdobiDo: "2012" },
    { jmeno: "Shawn Wade", nastroj: "baskytara", obdobiOd: "2007", obdobiDo: "2009" },
    { jmeno: "Mike McManus", nastroj: "bicí", obdobiOd: "2010", obdobiDo: "2011" },
    { jmeno: "Brad Reynolds", nastroj: "baskytara", obdobiOd: "2011", obdobiDo: "2012" },
    { jmeno: "Will Reed", nastroj: "baskytara", obdobiOd: "2012", obdobiDo: "2014" },
    { jmeno: "David Troia", nastroj: "baskytara", obdobiOd: "2014", obdobiDo: "2016" },
    { jmeno: "David Troia", nastroj: "baskytara", obdobiOd: "2017", obdobiDo: "2025" },
    { jmeno: "Pat Quave", nastroj: "bicí", obdobiOd: "2000", obdobiDo: "2000", zakladajici: true },
    { jmeno: "Stephen Poff", nastroj: "rytmická kytara", obdobiOd: "2000", obdobiDo: "2000", zakladajici: true },
    { jmeno: "Taylor Roberts", nastroj: "baskytara", obdobiOd: "2025", obdobiDo: "2025" },
  ];

  for (const c of clenove) {
    let h = await prisma.hudebnik.findFirst({ where: { jmeno: c.jmeno } });
    if (!h) h = await prisma.hudebnik.create({ data: { jmeno: c.jmeno } });
    const existuje = await prisma.clenstvi.findFirst({
      where: { hudebnikId: h.id, interpretId: interpret.id, obdobiOd: c.obdobiOd, obdobiDo: c.obdobiDo },
    });
    if (!existuje) {
      const role = c.zakladajici ? "zakládající člen" : c.obdobiDo ? "bývalý člen" : "člen";
      await prisma.clenstvi.create({
        data: { hudebnikId: h.id, interpretId: interpret.id, role, nastroj: c.nastroj, obdobiOd: c.obdobiOd, obdobiDo: c.obdobiDo },
      });
    }
  }

  const alba = [
    { nazev: "12 Stones", rok: "2002", poznamka: null as string | null },
    { nazev: "Potter's Field", rok: "2004", poznamka: null },
    { nazev: "Anthem for the Underdog", rok: "2007", poznamka: null },
    { nazev: "Beneath the Scars", rok: "2012", poznamka: null },
    { nazev: "Picture Perfect", rok: "2017", poznamka: "ROZPOR: chybí v primární diskografii ChatGPT výstupu, doporučeno ověřit u oficiálního zdroje" },
  ];
  for (const a of alba) {
    let album = await prisma.album.findFirst({ where: { nazev: a.nazev } });
    if (!album) {
      album = await prisma.album.create({ data: { nazev: a.nazev, datumVydani: a.rok, poznamka: a.poznamka } });
    }
    const existujeVazba = await prisma.albumInterpret.findFirst({ where: { albumId: album.id, interpretId: interpret.id } });
    if (!existujeVazba) {
      await prisma.albumInterpret.create({ data: { albumId: album.id, interpretId: interpret.id } });
    }
  }

  const pribehy = [
    { nadpis: "12 Stones: z garáže ke smlouvě během 15 měsíců", obsah: "Členové 12 Stones se poznali v Mandeville v Louisianě. Od vzniku kapely jim trvalo přibližně 15 měsíců, než podepsali smlouvu s vydavatelstvím Wind-up Records. Na tehdejší poměry šlo o mimořádně rychlý vzestup." },
    { nadpis: "Paul McCoy a světový hit Evanescence", obsah: "V roce 2003 hostoval Paul McCoy ve skladbě Bring Me to Life skupiny Evanescence. Píseň se stala celosvětovým hitem, získala cenu Grammy za nejlepší hardrockový výkon a výrazně zviditelnila i samotnou kapelu 12 Stones." },
    { nadpis: "Hudba 12 Stones ve filmech a WWE", obsah: "Skladby 12 Stones se objevily v řadě filmů, televizních pořadů i ve WWE. Například Broken byla oficiální skladbou WWE Judgment Day 2002, My Life zazněla ve filmu The Scorpion King, Photograph ve filmu Elektra a Shadows v traileru Piráti z Karibiku: Truhla mrtvého muže." },
    { nadpis: "Hurikán Katrina ovlivnil album Anthem for the Underdog", obsah: "Přípravy alba Anthem for the Underdog ovlivnily následky hurikánu Katrina. Kapela proto nahrávala v Memphisu a album vyšlo v roce 2007." },
  ];
  for (const p of pribehy) {
    const existuje = await prisma.pribeh.findFirst({ where: { nadpis: p.nadpis } });
    if (!existuje) await prisma.pribeh.create({ data: { nadpis: p.nadpis, obsah: p.obsah, stav: "overeno" } });
  }

  await prisma.zdroj.deleteMany({ where: { cilovyTyp: "Interpret", cilovyId: interpret.id, url: null } });
  const zdroje = [
    { nazev: "Oficiální web 12 Stones", url: "https://www.12stones.com/", kategorie: "oficialni_web", duvera: "vysoka" },
    { nazev: "Historie kapely (Wikipedia)", url: "https://en.wikipedia.org/wiki/12_Stones", kategorie: "orientacni", duvera: "stredni" },
    { nazev: "Diskografie (Wikipedia)", url: "https://en.wikipedia.org/wiki/12_Stones_discography", kategorie: "orientacni", duvera: "stredni" },
    { nazev: "Debutové album (Wikipedia)", url: "https://en.wikipedia.org/wiki/12_Stones_(album)", kategorie: "orientacni", duvera: "stredni" },
    { nazev: "AllMusic – biografie", url: "https://www.allmusic.com/artist/12-stones-mn0000501537", kategorie: "databaze", duvera: "stredni" },
    { nazev: "Apple Music – profil", url: "https://music.apple.com/us/artist/12-stones/18262766", kategorie: "orientacni", duvera: "stredni" },
  ];
  for (const z of zdroje) {
    const existuje = await prisma.zdroj.findFirst({ where: { cilovyTyp: "Interpret", cilovyId: interpret.id, url: z.url } });
    if (!existuje) {
      await prisma.zdroj.create({
        data: { cilovyTyp: "Interpret", cilovyId: interpret.id, nazev: z.nazev, url: z.url, kategorie: z.kategorie, uroverDuvery: z.duvera },
      });
    }
  }

  const pocetClenu = await prisma.clenstvi.count({ where: { interpretId: interpret.id } });
  const pocetAlb = await prisma.albumInterpret.count({ where: { interpretId: interpret.id } });
  const pocetZdroju = await prisma.zdroj.count({ where: { cilovyTyp: "Interpret", cilovyId: interpret.id } });
  console.log(`\nHOTOVO. 12 Stones (id ${interpret.id}): ${pocetClenu} záznamů členství, ${pocetAlb} alb, ${pocetZdroju} zdrojů.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

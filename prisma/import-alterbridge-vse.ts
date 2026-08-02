import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  let ab = await prisma.interpret.findFirst({ where: { nazev: "Alter Bridge" } });
  if (!ab) ab = await prisma.interpret.create({ data: { nazev: "Alter Bridge" } });

  await prisma.interpret.update({
    where: { id: ab.id },
    data: {
      rokVzniku: 2004,
      zeme: "Spojené státy americké",
      mesto: "Orlando, Florida",
      zanry: "Hard rock, Alternative metal, Heavy metal, Post-grunge",
      historie:
        "Alter Bridge vznikli v roce 2004 po rozpadu původní sestavy skupiny Creed. Kytarista Mark Tremonti, baskytarista Brian Marshall a bubeník Scott Phillips spojili síly se zpěvákem a kytaristou Mylesem Kennedym. Kapela je známá technicky propracovanou hrou, melodickými refrény a výraznými vokálními výkony. Za více než dvě desetiletí existence si udržela stejnou sestavu.",
      referencniId: "US-ALTER-BRIDGE-2004-002",
      urovenKarty: "referencni",
    },
  });

  const clenove = [
    { jmeno: "Myles Kennedy", nastroj: "zpěv, doprovodná kytara", poznamka: "dříve The Mayfield Four" },
    { jmeno: "Mark Tremonti", nastroj: "sólová kytara, doprovodný zpěv", poznamka: "dříve Creed" },
    { jmeno: "Brian Marshall", nastroj: "baskytara", poznamka: "dříve Creed" },
    { jmeno: "Scott Phillips", nastroj: "bicí", poznamka: "dříve Creed" },
  ];
  for (const c of clenove) {
    let h = await prisma.hudebnik.findFirst({ where: { jmeno: c.jmeno } });
    if (!h) h = await prisma.hudebnik.create({ data: { jmeno: c.jmeno } });
    const existuje = await prisma.clenstvi.findFirst({ where: { hudebnikId: h.id, interpretId: ab.id } });
    if (!existuje) {
      await prisma.clenstvi.create({
        data: { hudebnikId: h.id, interpretId: ab.id, role: "člen", nastroj: c.nastroj, obdobiOd: "2004", poznamka: c.poznamka },
      });
    }
  }

  const alba = [
    { nazev: "One Day Remains", rok: "2004" },
    { nazev: "Blackbird", rok: "2007" },
    { nazev: "AB III", rok: "2010" },
    { nazev: "Fortress", rok: "2013" },
    { nazev: "The Last Hero", rok: "2016" },
    { nazev: "Walk the Sky", rok: "2019" },
    { nazev: "Pawns & Kings", rok: "2022" },
  ];
  for (const a of alba) {
    let album = await prisma.album.findFirst({ where: { nazev: a.nazev } });
    if (!album) {
      album = await prisma.album.create({ data: { nazev: a.nazev, datumVydani: a.rok } });
    }
    const existujeVazba = await prisma.albumInterpret.findFirst({ where: { albumId: album.id, interpretId: ab.id } });
    if (!existujeVazba) {
      await prisma.albumInterpret.create({ data: { albumId: album.id, interpretId: ab.id } });
    }
  }

  const pribehy = [
    { nadpis: "Zrození Alter Bridge z popela Creed", obsah: "Alter Bridge vznikli poté, co se rozpadla sestava skupiny Creed. Mark Tremonti, Scott Phillips a Brian Marshall se rozhodli pokračovat bez Scotta Stappa a oslovili Mylese Kennedyho, kterého znali z kapely The Mayfield Four. Právě spojení těchto čtyř hudebníků dalo vzniknout Alter Bridge." },
    { nadpis: "Blackbird a nejlepší kytarové sólo", obsah: "Skladba Blackbird z alba stejného názvu se stala jednou z nejuznávanějších písní kapely. Její kytarové sólo Marka Tremontiho a Mylese Kennedyho bylo časopisem Guitarist zvoleno nejlepším kytarovým sólem všech dob v anketě čtenářů." },
    { nadpis: "Alter Bridge – stabilní sestava přes dvě dekády", obsah: "Od založení v roce 2004 hraje Alter Bridge ve stejné čtveřici: Myles Kennedy, Mark Tremonti, Brian Marshall a Scott Phillips. Více než dvě desetiletí bez personální změny je v rockové hudbě velmi neobvyklé." },
    { nadpis: "Album Pawns & Kings", obsah: "Sedmé studiové album Pawns & Kings vyšlo 14. října 2022. Producentem byl opět Michael „Elvis“ Baskette, který s kapelou spolupracuje dlouhodobě. Album navázalo na úspěch Walk the Sky a přineslo tvrdší zvuk i progresivnější kompozice." },
    { nadpis: "Alter Bridge na Rádiu Muflon", obsah: "Alter Bridge patří mezi výrazně zastoupené zahraniční kapely na playlistu Rádia Muflon. Aktuálně je zařazeno 13 skladeb, převážně z období alb Walk the Sky, Pawns & Kings a novější tvorby." },
  ];
  for (const p of pribehy) {
    const existuje = await prisma.pribeh.findFirst({ where: { nadpis: p.nadpis } });
    if (!existuje) await prisma.pribeh.create({ data: { nadpis: p.nadpis, obsah: p.obsah, stav: "overeno" } });
  }

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

  const existujeUdalost = await prisma.udalost.findFirst({ where: { nazev: "Vydání alba Pawns & Kings" } });
  if (!existujeUdalost) {
    await prisma.udalost.create({
      data: { nazev: "Vydání alba Pawns & Kings", datum: "10-14", typ: "vyroci_alba", opakujeSe: true, popis: "Sedmé studiové album Alter Bridge, vydané 14. října 2022.", stav: "overeno" },
    });
  }

  const pocetClenu = await prisma.clenstvi.count({ where: { interpretId: ab.id } });
  const pocetAlb = await prisma.albumInterpret.count({ where: { interpretId: ab.id } });
  const pocetPribehu = await prisma.pribeh.count();
  const pocetZdroju = await prisma.zdroj.count({ where: { cilovyTyp: "Interpret", cilovyId: ab.id } });
  console.log(`HOTOVO. Alter Bridge (id ${ab.id}): ${pocetClenu} členů, ${pocetAlb} alb, celkem ${pocetPribehu} příběhů v DB, ${pocetZdroju} zdrojů u interpreta.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

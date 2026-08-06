import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async functionnajdiNeboZaloz(nazev: string) {
  let i = await prisma.interpret.findFirst({ where: { nazev } });
  if (!i) i = await prisma.interpret.create({ data: { nazev } });
  return i;
}

async function main() {
  const kabat = await najdiNeboZaloz("Kabát");

  await prisma.interpret.update({
    where: { id: kabat.id },
    data: {
      rokVzniku: 1983,
      zeme: "Česká republika",
      mesto: "Teplice",
      zanry: "Hard rock, Rock, Heavy metal (rané období)",
      historie:
        "Kabát je nejúspěšnější česká rocková skupina novodobé historie. Charakteristická je dlouhodobě stabilní sestava, české texty, výrazné kytarové riffy a koncertní energie. Kapela pravidelně vyprodává největší haly a stadiony v České republice.\n\nJednou z největších předností Kabátu je mimořádně stabilní sestava. Od roku 1989 nedošlo k žádné změně v základní pětici členů, což je na české rockové scéně výjimečné.",
      redakcniVyznam:
        "Reprezentant českého hard rocku, interpret vhodný pro tematické vysílání, významný zdroj výročí, kapela s vysokou rozpoznatelností mezi posluchači, vhodná pro pravidelné připomínání v Mufloním kalendáři.",
      referencniId: "CZ-KABAT-1983-001",
      urovenKarty: "referencni",
    },
  });

  const clenove = [
    { jmeno: "Josef Vojtek", role: "zpěv", nastroj: "zpěv", obdobiOd: "1989", poznamka: "ROZPOR: jeden zdroj uvádí rok 1988, druhý 1989 - ověřit" },
    { jmeno: "Milan Špalek", role: "zakládající člen", nastroj: "baskytara, doprovodný zpěv", obdobiOd: "1983", poznamka: null },
    { jmeno: "Tomáš Krulich", role: "zakládající člen", nastroj: "kytara, doprovodný zpěv", obdobiOd: "1983", poznamka: null },
    { jmeno: "Ota Váňa", role: "člen", nastroj: "kytara", obdobiOd: "1990", poznamka: null },
    { jmeno: "Radek Hurčík", role: "stálý člen", nastroj: "bicí", obdobiOd: "1989", poznamka: "přezdívka Hurvajs" },
  ];
  for (const c of clenove) {
    let h = await prisma.hudebnik.findFirst({ where: { jmeno: c.jmeno } });
    if (!h) h = await prisma.hudebnik.create({ data: { jmeno: c.jmeno } });
    const existuje = await prisma.clenstvi.findFirst({ where: { hudebnikId: h.id, interpretId: kabat.id } });
    if (!existuje) {
      await prisma.clenstvi.create({
        data: { hudebnikId: h.id, interpretId: kabat.id, role: c.role, nastroj: c.nastroj, obdobiOd: c.obdobiOd, poznamka: c.poznamka },
      });
    }
  }

  const alba = [
    { nazev: "Má jí motorovou", rok: "1991" },
    { nazev: "Živě!", rok: "1992" },
    { nazev: "Děvky ty to znaj", rok: "1993" },
    { nazev: "Colorado", rok: "1994" },
    { nazev: "Země plná trpaslíků", rok: "1995" },
    { nazev: "Čert na koze jel", rok: "1997" },
    { nazev: "MegaHu", rok: "1999" },
    { nazev: "Go Satane Go", rok: "2000" },
    { nazev: "Dole v dole", rok: "2003" },
    { nazev: "Corrida", rok: "2006" },
    { nazev: "Banditi di Praga", rok: "2010" },
    { nazev: "Do pekla / Do nebe", rok: "2015" },
    { nazev: "El Presidento", rok: "2022" },
  ];
  const albaId: Record<string, string> = {};
  for (const a of alba) {
    let album = await prisma.album.findFirst({ where: { nazev: a.nazev } });
    if (!album) {
      album = await prisma.album.create({ data: { nazev: a.nazev, datumVydani: a.rok } });
      await prisma.albumInterpret.create({ data: { albumId: album.id, interpretId: kabat.id } });
    }
    albaId[a.nazev] = album.id;
  }

  const propojeni = [
    { skladba: "Bruce Willis", album: "MegaHu" },
    { skladba: "Burlaci", album: "Corrida" },
  ];
  for (const p of propojeni) {
    const skladba = await prisma.skladba.findFirst({
      where: { nazev: p.skladba, interpreti: { some: { interpretId: kabat.id } } },
    });
    if (skladba && albaId[p.album]) {
      await prisma.skladba.update({ where: { id: skladba.id }, data: { albumId: albaId[p.album] } });
    }
  }

  const udalosti = [
    { nazev: "Založení skupiny Kabát", datum: "1983", typ: "jina", popis: "Skupinu založili v Teplicích Milan Špalek a Tomáš Krulich." },
    { nazev: "Vznik současné sestavy Kabátu", datum: "1989", typ: "jina", popis: "Od tohoto roku hraje Kabát ve stejné pětičlenné sestavě bez přerušení." },
    { nazev: "Vydání debutového alba Má jí motorovou", datum: "1991", typ: "vyroci_alba", popis: "Debutové album znamenalo průlom a vedlo k podpisu smlouvy s vydavatelstvím Monitor." },
    { nazev: "Turné Dole v dole", datum: "2003", typ: "jina", popis: "První turné, při kterém Kabát vyprodal všechny zimní stadiony v ČR." },
    { nazev: "Kabát na Eurovision Song Contest", datum: "2007", typ: "jina", popis: "Kabát reprezentoval ČR písní Malá dáma." },
    { nazev: "Vydání alba El Presidento", datum: "2022", typ: "vyroci_alba", popis: null },
  ];
  for (const u of udalosti) {
    const existuje = await prisma.udalost.findFirst({ where: { nazev: u.nazev } });
    if (!existuje) {
      await prisma.udalost.create({
        data: { nazev: u.nazev, datum: u.datum, typ: u.typ, opakujeSe: true, popis: u.popis, stav: "overeno" },
      });
    }
  }

  const pribehy = [
    { nadpis: "Vznik kapely Kabát", obsah: "Kabát založili Milan Špalek a Tomáš Krulich v Teplicích. Kapela sama s humorem uvádí, že přesný rok založení je „1983 plus mínus jeden rok“, protože si jej členové dodnes nejsou stoprocentně jistí." },
    { nadpis: "Debut, který všechno změnil", obsah: "První album Má jí motorovou (1991) znamenalo pro Kabát průlom. Díky pozitivní odezvě fanoušků podepsala kapela smlouvu s vydavatelstvím Monitor, což otevřelo cestu k celostátní popularitě." },
    { nadpis: "Turné Dole v dole", obsah: "Turné v roce 2003 bylo prvním, při kterém Kabát vyprodal všechny zimní stadiony v České republice. Kapela jej sama označuje za zlomový okamžik své historie." },
    { nadpis: "Koncert na Vypichu", obsah: "Koncert Vypich II navštívilo více než 75 000 fanoušků, což představovalo rekordní návštěvnost koncertu českého interpreta." },
    { nadpis: "Kabát na Eurovision Song Contest", obsah: "Kabát reprezentoval Českou republiku na Eurovision Song Contest s písní Malá dáma. Přestože soutěžně neuspěl, skladba se stala jedním z největších koncertních hitů kapely." },
  ];
  for (const p of pribehy) {
    const existuje = await prisma.pribeh.findFirst({ where: { nadpis: p.nadpis } });
    if (!existuje) {
      await prisma.pribeh.create({ data: { nadpis: p.nadpis, obsah: p.obsah, stav: "overeno" } });
    }
  }

  const zdroje = [
    { nazev: "Kabát – Historie", url: "https://kabat.cz/historie/", kategorie: "oficialni_web" },
    { nazev: "Kabát – Diskografie", url: "https://kabat.cz/diskografie/", kategorie: "oficialni_web" },
    { nazev: "Kabát – Biografie", url: "https://kabat.cz/biografie/", kategorie: "oficialni_web" },
    { nazev: "Kabát – Oficiální web", url: "https://kabat.cz/", kategorie: "oficialni_web" },
    { nazev: "Kultura.cz – profil Kabátu", url: "https://www.kultura.cz/profile/25260-kabat", kategorie: "media" },
    { nazev: "Český hudební slovník (Masarykova univerzita)", url: "https://slovnik.ceskyhudebnislovnik.cz/index.php?id=1001132", kategorie: "kniha" },
  ];
  for (const z of zdroje) {
    const existuje = await prisma.zdroj.findFirst({ where: { cilovyTyp: "Interpret", cilovyId: kabat.id, url: z.url } });
    if (!existuje) {
      await prisma.zdroj.create({
        data: { cilovyTyp: "Interpret", cilovyId: kabat.id, nazev: z.nazev, url: z.url, kategorie: z.kategorie, uroverDuvery: "vysoka" },
      });
    }
  }

  console.log("Kabát – referenční karta naimportována.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

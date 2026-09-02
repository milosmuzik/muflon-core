/** Homonymum Vanaheim: česká kapela vs. nizozemská z Tilburgu. */

export const VANAHEIM_HISTORIE_CZ = `Česká kapela Vanaheim vznikla v prosinci 2015 v Chlumci nad Cidlinou. Od začátku spojuje energický heavy a power metal s vikingskou a severskou tematikou, texty jsou v češtině. Jméno si kapela vypůjčila ze severské mytologie – Vanaheim je jeden z devíti světů a domov bohů Vanů, spojovaných s plodností, moudrostí a přírodou.

Zakladateli byli bubeník Libor Král a kytarista Martin Drobný, záhy přibyl baskytarista Radek Hladík a zpěvák Radek Drobný. Debutové CD Věčná sláva vyšlo v lednu 2017, poté deska Zlatí rytíři (2018). Po úrazu původního zpěváka přišel Miloš Koblmüller a kapela se výrazněji stočila k vikingskému metalu: EP Křížem proti meči (2020) a album Amulet (2021). Následovaly singly Jörmungandr, Fenrir, HEL a Devět světů.

Zlomem je koncepční album Devět světů (vydání 21. března 2026), pokřtěné v chlumecké sokolovně při oslavě deseti let kapely. Klipy k Devět světů a Drakkar se točily v Norsku (Bergen, ostrov Halsnøy). Kapela hrála na Metalfestu, Masters of Rock a The Legends Rock Fest.`.trim();

export const VANAHEIM_SESTAVA_CZ = [
  { jmeno: "Miloslav Krejčí", role: "člen", nastroj: "zpěv", obdobiOd: "2023", obdobiDo: null as string | null },
  { jmeno: "Martin Drobný", role: "zakládající člen", nastroj: "kytara", obdobiOd: "2015", obdobiDo: null },
  { jmeno: "Jiří Kubišta", role: "člen", nastroj: "klávesy", obdobiOd: null, obdobiDo: null },
  { jmeno: "Radek Hladík", role: "zakládající člen", nastroj: "baskytara", obdobiOd: "2015", obdobiDo: null },
  { jmeno: "Libor Král", role: "zakládající člen", nastroj: "bicí", obdobiOd: "2015", obdobiDo: null },
];

const HOLANDSKE = [
  /tilburg/i,
  /nizozem/i,
  /nederland/i,
  /netherlands/i,
  /een verloren verhaal/i,
  /roede voor de borst/i,
  /fireflash/i,
  /zino van leerdam/i,
  /rikke linssen/i,
  /the house spirit/i,
  /mike seidel/i,
  /bram trommelen/i,
];

const CESKY_REPERTOAR = [
  /devět světů/i,
  /za obzor/i,
  /jörmungandr/i,
  /jormungandr/i,
  /drakkar/i,
  /fenrir/i,
  /král vikingů/i,
  /amulet/i,
  /zlatí rytíři/i,
  /křížem proti meči/i,
];

export function jeHolandskyVanaheimText(text: string | null | undefined): boolean {
  if (!text) return false;
  return HOLANDSKE.some((r) => r.test(text));
}

export function jeCeskyVanaheimRepertoar(text: string | null | undefined): boolean {
  if (!text) return false;
  return CESKY_REPERTOAR.some((r) => r.test(text));
}

export function maNasaditCeskehoVanaheima(args: {
  nazevInterpreta: string;
  skladba?: string | null;
  historie?: string | null;
  zeme?: string | null;
  mesto?: string | null;
}): boolean {
  if (!/^vanaheim$/i.test(args.nazevInterpreta.trim())) return false;
  if (jeCeskyVanaheimRepertoar(args.skladba ?? "")) return true;
  if (jeHolandskyVanaheimText(args.historie))
    return !/tilburg/i.test(args.mesto ?? "") || jeCeskyVanaheimRepertoar(args.skladba ?? "");
  if (/nizozem|netherlands/i.test(args.zeme ?? "") && jeCeskyVanaheimRepertoar(args.skladba ?? "")) return true;
  return false;
}

export const STAVY_WORKFLOW = [
  "navrh",
  "overeno",
  "schvaleno",
  "publikovano",
  "archivovano",
] as const;

export type StavWorkflow = (typeof STAVY_WORKFLOW)[number];

export const STAV_LABEL: Record<string, string> = {
  navrh: "Návrh",
  overeno: "Ověřeno",
  schvaleno: "Schváleno",
  publikovano: "Publikováno",
  archivovano: "Archivováno",
  aktivni: "Aktivní",
  ukonceny: "Ukončený",
  archivovany: "Archivovaný",
  neoverene: "Neověřené",
  nizka: "Nízká důvěra",
  stredni: "Střední důvěra",
  vysoka: "Vysoká důvěra",
};

export const STAV_BARVA: Record<string, string> = {
  navrh: "bg-raised text-muted border-line",
  overeno: "bg-sage/10 text-sage border-sage/40",
  schvaleno: "bg-accent/10 text-accent border-accent/40",
  publikovano: "bg-sage/20 text-sage border-sage/50",
  archivovano: "bg-rust/10 text-rust border-rust/40",
  aktivni: "bg-sage/10 text-sage border-sage/40",
  ukonceny: "bg-raised text-muted border-line",
  archivovany: "bg-rust/10 text-rust border-rust/40",
};

export const DALSI_STAV: Record<string, string | null> = {
  navrh: "overeno",
  overeno: "schvaleno",
  schvaleno: "publikovano",
  publikovano: "archivovano",
  archivovano: null,
};

export const TYPY_ENTIT: Record<string, string> = {
  Interpret: "Interpret",
  Hudebnik: "Hudebník",
  Album: "Album",
  Skladba: "Skladba",
  Pribeh: "Příběh",
  Udalost: "Událost",
};

// Hierarchie zdrojů pro tvorbu příběhů (Muflon Core Bible).
// Pořadí = priorita/důvěryhodnost, nejnižší číslo = nejvyšší priorita.
export const KATEGORIE_ZDROJE: { klic: string; priorita: number; label: string }[] = [
  { klic: "oficialni_web", priorita: 1, label: "Oficiální web interpreta" },
  { klic: "socialni_site", priorita: 2, label: "Oficiální sociální sítě" },
  { klic: "archivni", priorita: 3, label: "Booklet, tiskovina, archivní dokument" },
  { klic: "databaze", priorita: 4, label: "Hudební databáze (AllMusic, Discogs, MusicBrainz…)" },
  { klic: "media", priorita: 5, label: "Hudební média (Loudwire, Blabbermouth, Metal Hammer…)" },
  { klic: "rozhovor", priorita: 6, label: "Rozhovor / ověřené video" },
  { klic: "kniha", priorita: 7, label: "Kniha, biografie" },
  { klic: "orientacni", priorita: 8, label: "Orientační zdroj (Wikipedia, fanouškovský web)" },
];

export const KATEGORIE_ZDROJE_LABEL: Record<string, string> = Object.fromEntries(
  KATEGORIE_ZDROJE.map((k) => [k.klic, k.label])
);
export const KATEGORIE_ZDROJE_PRIORITA: Record<string, number> = Object.fromEntries(
  KATEGORIE_ZDROJE.map((k) => [k.klic, k.priorita])
);

// Pořadí úrovní důvěry od nejnižší po nejvyšší – použij k porovnávání
// (např. "je tenhle zdroj aspoň středně důvěryhodný?").
export const UROVEN_DUVERY_PORADI = ["neoverene", "nizka", "stredni", "vysoka"] as const;

export function urovenDuveryPriorita(uroven: string): number {
  const idx = UROVEN_DUVERY_PORADI.indexOf(uroven as (typeof UROVEN_DUVERY_PORADI)[number]);
  return idx === -1 ? 0 : idx;
}

// Renomovaná rocková/metalová média a databáze s historií – redakcí ručně
// odsouhlasený seznam domén (stav k 29. 8. 2026, viz redakční poznámka u
// jednotlivých skupin). Zdroj v kategorii "media" nebo "databaze" počítá
// jako důvěryhodný STEJNĚ jako oficiální web/sociální síť interpreta jen
// tehdy, když jeho URL patří sem; jinak samo o sobě na automatické
// schválení nestačí (viz urovenDuveryZeZdroje níže). Rozšiřuj opatrně – jde
// o redakční rozhodnutí, ne o technický detail.
export const RENOMOVANE_ZDROJE_DOMENY = [
  // Databáze/encyklopedie – nejlepší na holá fakta (kapela, album, sestava, rok).
  "metal-archives.com", // Encyclopaedia Metallum
  "allmusic.com",
  "rateyourmusic.com",
  "metalstorm.net",
  // Dlouhodobě zavedené tiskové značky – nejlepší na kontext a historii.
  "decibelmagazine.com",
  "bravewords.com",
  "kerrang.com",
  "loudersound.com", // Metal Hammer UK + Classic Rock
  "metalhammer.co.uk",
  "metal-hammer.de",
  "rockhard.de",
  "bleeding4metal.de",
  "spark-rockmagazine.cz",
  "rockandpop.cz",
  "burrn.online",
  "heavymag.com.au",
  // Zpravodajské weby – nejlepší na rychlost, menší hloubka.
  "blabbermouth.net",
  "loudwire.com",
  "metalinjection.net",
  "angrymetalguy.com",
  "revolvermag.com",
];

function jeRenomovanyZdroj(url: string | null): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return RENOMOVANE_ZDROJE_DOMENY.some((d) => host === d || host.endsWith(`.${d}`));
}

// Odvodí úroveň důvěry zdroje z jeho kategorie a URL (hierarchie zdrojů
// výše + redakční whitelist médií/databází). Jako dostatečný zdroj pro
// automatické schválení (vysoká důvěra) počítá jen oficiální web/sociální
// síť interpreta, nebo článek/záznam na renomovaném serveru z whitelistu
// (ať už jde o databázi, nebo médium). Obecná databáze/archiv mimo
// whitelist (např. Discogs, MusicBrainz) je střední, rozhovory/knihy
// nízká, orientační zdroje (Wikipedia, fanouškovský web) neověřené.
export function urovenDuveryZeZdroje(kategorie: string, url: string | null): string {
  if (kategorie === "oficialni_web" || kategorie === "socialni_site") return "vysoka";
  if (kategorie === "media" || kategorie === "databaze") {
    if (jeRenomovanyZdroj(url)) return "vysoka";
    return kategorie === "databaze" ? "stredni" : "neoverene";
  }
  const priorita = KATEGORIE_ZDROJE_PRIORITA[kategorie] ?? 8;
  if (priorita <= 4) return "stredni";
  if (priorita <= 7) return "nizka";
  return "neoverene";
}

// Od téhle úrovně důvěry (a výš) se událost/příběh schvaluje automaticky,
// bez ručního ověření – viz DALSI_STAV workflow (navrh -> overeno ->
// schvaleno). Jen "vysoká": oficiální kanál interpreta, nebo renomované
// rockové/metalové médium z whitelistu výše. Databáze, rozhovory ani knihy
// samy o sobě nestačí.
export const AUTOSCHVALENI_OD_UROVNE = urovenDuveryPriorita("vysoka");

// Poznámky, kterými si zdroje vytvořené AI agentem značí svůj původ –
// podle nich jde poznat "napevno" dosazenou důvěru od té, co ručně
// zvolil člověk ve formuláři ZdrojeSekce, a bezpečně ji přepočítat.
export const POZNAMKA_AI_NAVRH_KALENDAR = "Navrženo AI agentem – doporučeno ověřit před zveřejněním.";
export const POZNAMKA_AI_ROZSIRENI = "Doplněno přes „Zjisti více“.";

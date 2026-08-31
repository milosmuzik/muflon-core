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
  // Doplněno na základě vzorku skutečných zdrojů, na které se po opravě
  // Google redirectu (viz PR #20) rozbalily AI návrhy - ověřeno web searchem.
  "ultimateclassicrock.com", // Townsquare Media
  "thisdayinmusic.com", // zavedeno 1999, editor Neil Cossar
  "metalassault.com", // metalový webzín, založen 2010
  "fakker.cz", // český magazín propojený se Spark Rock Magazine
  "everythingisnoise.net",
  "themetalvoice.com",
  "thecurrent.org", // Minnesota Public Radio
  // Mimo severoamerický/evropský okruh - Japonsko a Jižní Amerika.
  "roadiecrew.com", // brazilský rock/metal magazín, od 1997
  "whiplash.net", // brazilský rock/metal web, od 1996
  "natalie.mu", // japonský hudební zpravodajský web, od 2007
  "barks.jp", // přední japonské hudební médium, od 2001
  "rockinon.com", // Rockin'on, japonský hudební vydavatel od 1972
  // Severní Evropa.
  "swedenrock.com", // Sweden Rock Magazine, od 2001
  "swedenrockmagazine.com",
  "gaffa.dk", // od 1983, nejstarší skandinávský hudební magazín (DK/SE/NO)
  "impe.fi", // Imperiumi, finské metalové médium od 2002
  "heavymetal.no", // norský metalový webzín
  // Německo, Francie, Itálie, Španělsko, Polsko.
  "legacy.de", // Legacy Magazine, od 1999
  "rockhard.fr", // francouzská edice Rock Hard, od 2001
  "metalhammer.it", // italská edice Metal Hammer, od 2015
  "mariskalrock.com", // La Heavy, od 1982
  "rockmetal.pl", // od 1996, první hudební portál v Polsku
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

// Přátelské názvy pro doménu zdroje - používá se místo toho, co si AI agent
// sám napsal jako "název zdroje". Gemini občas pojmenuje citaci jménem
// média (Loudwire, Metal Hammer...), i když skutečná URL, na kterou se
// grounding odkazuje, vede úplně jinam (např. na Wikipedii) - jméno podle
// domény tohle znemožní, protože vychází z faktické adresy, ne z tvrzení AI.
const ZNAME_NAZVY_DOMEN: Record<string, string> = {
  "metal-archives.com": "Encyclopaedia Metallum: The Metal Archives",
  "allmusic.com": "AllMusic",
  "rateyourmusic.com": "Rate Your Music",
  "metalstorm.net": "Metal Storm",
  "decibelmagazine.com": "Decibel Magazine",
  "bravewords.com": "BraveWords",
  "kerrang.com": "Kerrang!",
  "loudersound.com": "Louder (Metal Hammer / Classic Rock)",
  "metalhammer.co.uk": "Metal Hammer",
  "metal-hammer.de": "Metal Hammer DE",
  "rockhard.de": "Rock Hard",
  "bleeding4metal.de": "Bleeding4Metal",
  "spark-rockmagazine.cz": "Spark Rock Magazine",
  "rockandpop.cz": "Rock & Pop",
  "burrn.online": "BURRN!",
  "heavymag.com.au": "HEAVY Magazine",
  "blabbermouth.net": "Blabbermouth.net",
  "loudwire.com": "Loudwire",
  "metalinjection.net": "Metal Injection",
  "angrymetalguy.com": "Angry Metal Guy",
  "revolvermag.com": "Revolver",
  "ultimateclassicrock.com": "Ultimate Classic Rock",
  "thisdayinmusic.com": "This Day in Music",
  "metalassault.com": "Metal Assault",
  "fakker.cz": "Fakker!",
  "everythingisnoise.net": "Everything Is Noise",
  "themetalvoice.com": "The Metal Voice",
  "thecurrent.org": "The Current (Minnesota Public Radio)",
  "roadiecrew.com": "Roadie Crew",
  "whiplash.net": "Whiplash.Net",
  "natalie.mu": "Natalie",
  "barks.jp": "BARKS",
  "rockinon.com": "Rockin'on",
  "swedenrock.com": "Sweden Rock Magazine",
  "swedenrockmagazine.com": "Sweden Rock Magazine",
  "gaffa.dk": "GAFFA",
  "impe.fi": "Imperiumi",
  "heavymetal.no": "Heavymetal.no",
  "legacy.de": "Legacy Magazine",
  "rockhard.fr": "Rock Hard France",
  "metalhammer.it": "Metal Hammer Italia",
  "mariskalrock.com": "La Heavy",
  "rockmetal.pl": "Rockmetal.pl",
  "wikipedia.org": "Wikipedia",
  "youtube.com": "YouTube",
  "bandcamp.com": "Bandcamp",
  "discogs.com": "Discogs",
  "musicbrainz.org": "MusicBrainz",
  "facebook.com": "Facebook",
  "instagram.com": "Instagram",
  "x.com": "X (Twitter)",
  "twitter.com": "X (Twitter)",
};

// Vrátí důvěryhodný název zdroje odvozený ze SKUTEČNÉ domény URL, ne z
// toho, co si vygeneroval AI agent. Když URL nejde rozebrat, vrátí aspoň
// původní název, ať záznam nezůstane bez popisku.
export function nazevZeZdroje(url: string | null, puvodniNazev: string): string {
  if (!url) return puvodniNazev;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return puvodniNazev;
  }
  const znamy =
    ZNAME_NAZVY_DOMEN[host] ?? Object.entries(ZNAME_NAZVY_DOMEN).find(([d]) => host.endsWith(`.${d}`))?.[1];
  return znamy ?? host;
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
export const POZNAMKA_DOHLEDANO = "Dohledáno AI fact-checkerem – oficiální kanál nebo renomované médium.";

// Přípona, kterou revidovatVse() (lib/agent/revize-vse.ts) připojí k
// poznámce po zpracování zdroje, ať se schválil, nebo ne. Bez ní by fronta
// "Revize databáze" natrvalo obsahovala i zdroje, které revizí už jednou
// prošly a zůstaly nedostatečné (výsledek je deterministický - opakovaná
// revize by u nich pokaždé dopadla stejně) - každé nové otevření /kontrola
// by je muselo znovu proklikat, než by se dostalo k opravdu novým zdrojům
// z dalšího importu. Poznámka s touto příponou proto z fronty revize (a z
// odpočtu na /kontrola) přirozeně vypadne, ale zůstává v AI_POZNAMKY
// hledání se STARTSWITH pro smazatNekvalifikovane() (lib/agent/uklid.ts) -
// ten musí najít i tyhle "jednou revidované a pořád nedostatečné" zdroje.
export const PRIPONA_ZDROJ_REVIDOVAN = " [revize: beze změny]";

// Stejný účel jako výše, ale pro dávkový import sestav z MusicBrainz
// (prisma/enrich-hudebnici.ts) – podle poznámky na Clenstvi jde na
// /kontrola dohledat, které sestavy vznikly automaticky a čekají na
// lidskou kontrolu.
export const POZNAMKA_MB_CLENSTVI = "Automaticky doplněno z MusicBrainz – doporučeno ověřit.";

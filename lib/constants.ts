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

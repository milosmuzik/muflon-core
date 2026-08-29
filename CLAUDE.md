# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Co appka dělá

Znalostní systém pro redakční práci Rádia Muflon — postaveno podle „Muflon Core Bible". Pokrývá Etapu 1 (interpreti, hudebníci, alba, skladby, vazby, zdroje), Etapu 2 (příběhy, události, historie změn, propojení) a základ Etapy 3 (redakční workflow) a Etapy 4 (Muflonní kalendář). Etapa 5 (AI asistent) zatím není součástí.

**Princip datového modelu:** objekt + vlastnosti + vztahy + zdroje + historie = znalost.

**Důležité pravidlo z Bible:** „Nejdříve se mění Bible. Teprve potom se mění software" — při rozšiřování domény napřed patří odpovídající kapitola do Muflon Core Bible, teprve pak implementace.

## Příkazy

```bash
npm install
cp .env.example .env      # vlož skutečný DATABASE_URL
npm run db:push           # aplikuje prisma/schema.prisma na databázi (bez migrací)
npm run db:seed           # naimportuje prisma/data/playlist.tsv (interpreti + skladby)
npm run dev                # http://localhost:3000
npm run build              # produkční build (next build)
npm run lint                # next lint
npm run db:studio          # Prisma Studio — vizuální prohlížeč dat
```

Žádný testovací framework/skripty v projektu nejsou. `postinstall` automaticky pouští `prisma generate`.

Jednorázové/ladicí skripty se spouští přímo přes `tsx`, např. `npx tsx prisma/import-batch.ts` nebo `npx tsx pridat-skladby.ts` — `prisma/` obsahuje historii jednorázových importních/opravných skriptů (import konkrétních interpretů, slučování duplicit, diagnostiku), které slouží jako reference, ne jako opakovaně spouštěný kód.

## Architektura

**Next.js 14 App Router**, jedna sekce (route + Server Component page) na entitu pod `app/` (`interpreti/`, `hudebnici/`, `alba/`, `skladby/`, `pribehy/`, `udalosti/`, `kalendar/`, `hledat/`, `kontrola/`, `import/`). Mutace jdou přes Server Actions (`"use server"`) v `lib/actions/`, jeden soubor na entitu + `spolecne.ts` pro sdílené operace napříč entitami.

### Datový model (`prisma/schema.prisma`)

Centrální uzel je **Interpret** (kapela/projekt), napojený na:
- **Hudebnik** (fyzická osoba) přes join model **Clenstvi** — kariéra hudebníka je historie těchto vztahů, ne pole na entitě.
- **Album** a **Skladba** přes join modely `AlbumInterpret` / `SkladbaInterpret` (M:N).
- **Skladba** může mít `puvodniVerzeId` (odkaz na jinou Skladbu — cover/remaster jsou samostatné entity, ne verze jedné).

Napříč entitami fungují tři polymorfní modely (identifikace přes `cilovyTyp`/`cilovyId` stringy, ne relace v DB):
- **Zdroj** — ověřitelnost; `kategorie` má pevnou hierarchii důvěryhodnosti definovanou v `lib/constants.ts` (`KATEGORIE_ZDROJE`, priorita 1 = nejdůvěryhodnější).
- **Vazba** — obecná hrana znalostní sítě mezi libovolnými dvěma objekty (`zdrojovyTyp/Id` → `cilovyTyp/Id`).
- **HistorieZmeny** — audit log; každá mutace v `lib/actions/` po sobě volá `zapisHistorii()` z `lib/history.ts`.

**Pribeh** a **Udalost** mají redakční `stav` workflow: `navrh → overeno → schvaleno → publikovano → archivovano` (posloupnost v `DALSI_STAV`, `lib/constants.ts`; posun přes `posunoutStav()` v `lib/actions/spolecne.ts`). **Interpret** má samostatný, jednodušší `urovenKarty` stav.

Při přidávání nové entity, která má mít zdroje/vazby/historii, ji stačí zapojit do `switch` větví v `najdiIdPodleNazvu()` a `nazevObjektu()` (`lib/actions/spolecne.ts`) a přidat do `TYPY_ENTIT` (`lib/constants.ts`) — zbytek (UI komponenty `ZdrojeSekce`, `VazbySekce`, `HistorieSekce`) je generický.

### Slučování duplicit

`lib/actions/slouceni.ts` řeší merge dvou záznamů stejného typu (typicky Interpret): doplní chybějící pole z mazaného záznamu do ponechaného (`SLUCITELNA_POLE`), přepojí všechny join tabulky a polymorfní odkazy (Zdroj, Vazba, HistorieZmeny) na `ponechatId`, teprve pak smaže duplicitu — vše v jedné `prisma.$transaction`.

### AI integrace (Gemini)

Tři nezávislé agentní funkce, všechny volají Gemini REST API přímo (`fetch`, model `gemini-flash-lite-latest`), bez SDK:
- **`lib/agent/import-karty.ts`** — extrahuje strukturovaná data z neformátovaného textu „referenční karty" do JSON (interpret + členové + alba + události + příběhy + zdroje). Vstupní bod je chráněný endpoint `app/api/admin/import-karty/route.ts` (auth přes `X-Import-Key` header proti `IMPORT_API_KEY`), který volá MCP server (`import_muflon_karty`) — **nikdy ho nedávej veřejně bez klíče**.
- **`lib/agent/navrhy-kalendar.ts`** — denně (cron) generuje návrhy kalendářních událostí přes Gemini s `google_search` tool, s vynucenou hierarchií důvěryhodnosti zdrojů (stejná jako `KATEGORIE_ZDROJE`). Vstupní bod `app/api/cron/navrhy-kalendar/route.ts`, auth přes `Authorization: Bearer $CRON_SECRET`.
- **`lib/agent/zjisti-vice.ts`** — doplňkové obohacení dat (viz `npm run enrich:hudebnici`).

Všechny tři AI funkce parsují odpověď Gemini jako "vrať POUZE JSON, žádný markdown" a mají fallback na extrakci JSON mezi první `{`/`[` a poslední `}`/`]` pro případ, že model přesto markdown přidá.

### Sociální sítě

`lib/socialni/facebook.ts` a `lib/socialni/instagram.ts` — publikace na Facebook/Instagram (přes `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID`, `INSTAGRAM_ACCOUNT_ID`), stav se eviduje v modelu **Publikace**. `app/api/socialni/obrazek/[id]/route.tsx` generuje obrázek pro post (Next.js OG image).

## Proměnné prostředí

| Proměnná | Účel |
|---|---|
| `DATABASE_URL` | Prisma → PostgreSQL (Vercel Postgres / Neon) |
| `GEMINI_API_KEY` | AI import karet, návrhy kalendáře, enrichment |
| `CRON_SECRET` | autorizace `app/api/cron/*` |
| `IMPORT_API_KEY` | autorizace `app/api/admin/import-karty` |
| `NEXT_PUBLIC_APP_URL` | základ pro absolutní URL (default `https://muflon-core.vercel.app`) |
| `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID`, `INSTAGRAM_ACCOUNT_ID` | publikace na sociální sítě |

## Styl

Tailwind s vlastní barevnou paletou (`bg-raised`, `text-muted`, `border-line`, `bg-sage`, `bg-accent`, `bg-rust` — viz `tailwind.config.ts` / `app/globals.css`), používanou konzistentně napříč `STAV_BARVA` a komponentami. Texty v UI i komentářích jsou česky, identifikátory (modely, pole, funkce) taktéž — drž se toho i v novém kódu.

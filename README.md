# Muflon Core

Znalostní systém pro redakční práci Rádia Muflon — postaveno podle „Muflon Core Bible".

Pokrývá Etapu 1 (interpreti, hudebníci, alba, skladby, vazby, zdroje), Etapu 2
(příběhy, události, historie změn, propojení), a základ Etapy 3 (redakční
workflow: návrh → ověřeno → schváleno → publikováno → archivováno) a Etapy 4
(Muflonní kalendář). Etapa 5 (AI asistent) zatím není součástí.

## Technologie

- **Next.js 14** (App Router, Server Components, Server Actions) + TypeScript
- **Prisma** + **PostgreSQL**
- **Tailwind CSS**

## Spuštění naostro (Vercel)

1. Nahraj tento kód do GitHub repozitáře.
2. Na [vercel.com](https://vercel.com) → **Add New Project** → vyber repozitář.
3. V nastavení projektu přidej **Vercel Postgres** (Storage → Create Database
   → Postgres, poháněno Neonem) — Vercel sám doplní proměnnou `DATABASE_URL`.
4. Nasaď. Po prvním nasazení jednorázově spusť migraci schématu a import
   playlistu — buď lokálně s produkčním `DATABASE_URL` (viz níže), nebo přes
   `vercel env pull` + stejné příkazy.

## Lokální vývoj

Vyžaduje Node.js 18+ a připojení na PostgreSQL (nejjednodušší: stejná Vercel
Postgres databáze, nebo zdarma účet na [neon.tech](https://neon.tech)).

```bash
npm install
cp .env.example .env      # vlož skutečný DATABASE_URL
npm run db:push           # vytvoří tabulky podle prisma/schema.prisma
npm run db:seed           # naimportuje playlist.tsv (interpreti + skladby)
npm run dev                # http://localhost:3000
```

`npm run db:studio` otevře Prisma Studio — vizuální prohlížeč databáze,
užitečný pro rychlou kontrolu dat.

## Struktura

```
prisma/schema.prisma     datový model (Interpret, Hudebník, Album, Skladba,
                          Příběh, Událost, Zdroj, Vazba, HistorieZmeny)
prisma/data/playlist.tsv skutečný playlist Rádia Muflon (zdroj pro seed)
prisma/seed.ts            import playlistu → Interpreti + Skladby
lib/actions/               server akce (mutace) po jednotlivých entitách
lib/                       sdílené pomocné funkce (historie, konstanty, kalendář)
components/                znovupoužitelné UI (ZdrojeSekce, VazbySekce, …)
app/                       stránky (App Router) — jedna sekce na entitu
```

## Co (zatím) chybí a je logickým dalším krokem

- **Etapa 3, zbytek:** připomínky/notifikace, systematická kontrola kvality
  dat (např. hromadné hledání záznamů bez zdroje napříč všemi entitami).
- **Etapa 4, zbytek:** plánování obsahu a historie publikování napojená na
  kalendář, tematické série.
- **Etapa 5:** AI asistent (návrhy souvislostí, chybějící informace) — Bible
  jej záměrně řadí až na konec, po ustálení datové kvality.
- Autentizace/uživatelé a přístupová práva (Bible o nich explicitně nemluví,
  ale pro víc redaktorů bude potřeba).
- Verzování/historie u polí (aktuálně se loguje akce, ne diff hodnot).

Podle zásady z Bible „Nejdříve se mění Bible. Teprve potom se mění software“
doporučuju při rozšiřování napřed doplnit odpovídající kapitolu v Muflon Core
Bibli a teprve poté implementovat.

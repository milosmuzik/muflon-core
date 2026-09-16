# Oprava 504 timeoutů – návod k nahrání

19 souborů (16 upravených + 1 nový produkční `rozpocet-casu.ts` + 2 nové
testy + 1 upravený test). Cesty odpovídají přesně struktuře repa
`milosmuzik/muflon-core` – v GitHubu se do každé složky proklikni a použij
**Add file → Upload files**, přetáhni odpovídající soubor(y) a commitni.
Pořadí nahrávání nehraje roli, klidně po složkách:

```
lib/agent/rozpocet-casu.ts            (NOVÝ soubor)
lib/agent/rozpocet-casu.test.ts       (NOVÝ soubor)
lib/agent/databaze.ts
lib/agent/databaze.test.ts
lib/agent/redirect.ts
lib/agent/gemini.ts
lib/agent/doplnit-katalog.ts
lib/agent/vyroci-z-katalogu.ts
lib/agent/doplnit-pribehy.ts
lib/agent/dohledat-zdroj.ts
lib/agent/dohledat-zdroj.test.ts      (NOVÝ soubor)
lib/agent/dohledat-zdroje-hromadne.ts
lib/agent/automaticka-revize.ts
lib/agent/navrhy-kalendar.ts
lib/constants.ts
lib/actions/auto-doplnovani.ts
lib/actions/kontrola.ts
app/api/cron/auto-doplnovani/route.ts
app/api/cron/sdruzena-kontrola/route.ts
```

Žádné jiné soubory se nemění, nic se nemaže.

## Co bylo doopravdy špatně (ne hypotéza – ověřeno přímo v kódu)

Obě cronové route (`auto-doplnovani`, `sdruzena-kontrola`) měly maxDuration
60s, ale žádný SKUTEČNÝ celkový strop na to, co se v nich reálně dělo:

- `sdruzena-kontrola` volala 6 kroků za sebou (`smazatOdpadoveInterprety`,
  `opravitFeatDavku`, `doplnitVyrociZKatalogu`, `doplnitKatalogDavku`,
  `dohledatChybejiciZdroje`, `spustitAutomatickouRevizi`) + 7. krok
  (`vygenerovatNavrhyKalendare`) v routě samotné – **bez jakékoli časové
  ochrany**. Jen `dohledatChybejiciZdroje(5)` sama o sobě mohla v nejhorším
  případě (Metal Archives/MusicBrainz/Gemini pomalé, ne nutně nedostupné)
  běžet přes 3 minuty – 10 položek × až 3 sekvenční MA dotazy × 8s.
- `auto-doplnovani` měla vnitřní 45s `Promise.race` timeout, ale ten
  1) obalovat jen prostřední část (chránil `doplnitKatalogDavku`, ale ne
  úvodní/závěrečné DB dotazy), 2) doopravdy nic nerušil – jen přestal čekat,
  takže běžící MusicBrainz/Gemini volání běžela na pozadí dál, 3) vlastní
  komentář v kódu podhodnocoval worst-case skoro na polovinu (počítal
  s 1 položkou a 1 Gemini voláním, kód reálně dělá 2 položky + 2 Gemini
  volání).

## Jak to řeší tahle oprava

Nový sdílený modul `lib/agent/rozpocet-casu.ts`: JEDEN časový rozpočet na
celý HTTP request, provázaný přes `AbortController`/`AbortSignal` se VŠEMI
síťovými voláními (MusicBrainz, Metal Archives, Gemini, rozbalení Google
redirectu) napříč celým řetězcem volání. Rozpočet:

1. Fetch doopravdy PŘERUŠÍ (`signal.abort()`), ne jen přestane čekat –
   ověřeno testem (`databaze.test.ts`), který simuluje navěky visící
   MusicBrainz odpověď a dokazuje, že se signál abortne přesně v okamžiku
   vypršení rozpočtu.
2. Mezi položkami/kroky dávky se kontroluje, jestli ještě zbývá čas – další
   krok/položka se vůbec nezačne, pokud by neměla šanci doběhnout.
3. Cokoli se stihlo zjistit, se na konci vždy uloží (ukládání jsou jen
   rychlé DB zápisy, žádná další síťová volání) – žádná práce se nezahazuje.
4. `ROZPOCET_AUTO_DOPLNOVANI_MS` (35s) a `ROZPOCET_SDRUZENA_KONTROLA_MS`
   (45s, sdíleno mezi kontrolou i kalendářem) v `lib/constants.ts` – oba
   výrazně pod stropem 60s, ať zbyde reálná rezerva na cold start funkce a
   připojení k Neonu.

### Bezpečnostně nejcitlivější místo: `dohledat-zdroj.ts`

`dohledatChybejiciZdroje` maže Příběh/Událost, když se pro ně nenajde zdroj.
Riziko: kdyby časový rozpočet vypršel uprostřed kontroly a kód by to
vyhodnotil stejně jako "zkontrolováno, nic se nenašlo", smazaly by se
záznamy, které jsme jen NESTIHLI zkontrolovat. Přepsáno tak, aby
`dohledatZdrojeVDavce` vracelo `nenalezeno` (smí se smazat) a `nezpracováno
kvůli rozpočtu` (NESMÍ se smazat, zkusí se příště) jako dvě oddělené věci –
ověřeno 5 testy v `dohledat-zdroj.test.ts`, včetně scénáře, kdy Gemini na
položku v odpovědi zapomene.

## Co jsem reálně otestoval (a co ne)

Udělal jsem skutečný `git clone` veřejného repa, aplikoval opravu na
reálné soubory a spustil:

- **`npx tsc --noEmit`** nad celým projektem: 0 nových chyb (diff proti
  stavu před opravou je čistě posun čísel řádků u již existujících, s touhle
  opravou nesouvisejících chyb ve `lib/bez-zdroje.ts`, `lib/homonyma/*` a
  pár `prisma/*.ts` skriptech).
- **`npx vitest run`**: 43 z 43 spustitelných testů prošlo (17 nových +
  26 původních). 2 existující testovací soubory (`duplicity.test.ts`,
  `vyroci-z-katalogu.test.ts`) v tomhle sandboxu selhávaly už PŘED mojí
  úpravou (ověřil jsem na původním kódu) – prostředí bez sítě k
  `binaries.prisma.sh` nemůže stáhnout Prisma engine, takže cokoli
  transitivně importuje `@/lib/prisma`, spadne na inicializaci. Nesouvisí s
  touhle opravou a na Vercelu (kde Prisma engine normálně existuje) se to
  nestane.
- Nové testy konkrétně dokazují: skutečné zrušení visícího fetche (ne jen
  přestat čekat), okamžitý bail-out bez síťového volání když je rozpočet
  už vyčerpaný, zkrácení per-volání stropu podle zbývajícího rozpočtu, a
  především správné rozlišení nenalezeno/nezpracováno u mazání.

Co jsem OVĚŘIT NEMOHL (nemám přístup k tvému Vercel/Neon/Gemini): jak dlouho
doopravdy trvá cold start tvé funkce, skutečnou rychlost Neonu, a jestli
MusicBrainz/Metal Archives Vercel IP časem opravdu blokují. Rozpočty (35s /
45s) jsou nastavené s bezpečnou rezervou (15–25s pod stropem 60s) přesně
proto, aby i při pomalém cold startu/Neonu funkce vždy stihla odpovědět.
Pokud by se i tak něco nevešlo, `?secret=...` test teď místo tichého 504
vrátí JSON s `chyby: [...]`, který přesně řekne, který krok se kvůli
rozpočtu přeskočil – to je diagnosticky mnohem užitečnější než dosavadní
prázdná 504 stránka.

## Dodatek: zpětná kontrola kalendáře (16. 9. chybělo)

Po nasazení výše ses všiml, že 16. 9. v `/kalendar` chybí – přesně ten den,
na který v posledním běhu padla chyba `"Časový rozpočet vypršel během
čekání na pacing Gemini."`. Příčina: `vygenerovatNavrhyKalendare` se
pokaždé ptá jen na AKTUÁLNÍ den, takže den vynechaný kvůli rozpočtu
zůstával bez AI návrhu natrvalo (do stejného data příští rok).

Oprava (jen `lib/agent/navrhy-kalendar.ts` + nový test
`lib/agent/navrhy-kalendar.test.ts`, nahraď/přidej tyhle 2 soubory navíc):
funkce teď vždycky zkontroluje dnešek **a navíc posledních 5 dní zpátky**
(`DNI_ZPETNE_KONTROLY`), ve stejném pořadí priority (dnešek první). Den,
který už má dost událostí, se přeskočí bez volání Gemini – takže to v
běžném provozu nestojí nic navíc, jen dohání dny, které se minule
nestihly. Ověřeno 4 novými testy (pořadí dní, přeskočení už pokrytého dne,
zastavení při vyčerpání rozpočtu).

16. 9. samotné se tímhle zpětně NEDOPLNÍ automaticky (ta oprava platí až
pro běhy PO nahrání) – při příštím běhu `sdruzena-kontrola` (denní cron,
6:00) by ale už mělo vyjít, protože spadá do nového 5denního okna zpětně
od tehdejšího "dneška".

## Dodatek 2: proč "dohledání zdrojů" a "revize" nikdy nedostaly šanci

Při ručním spouštění sdružené kontroly ses všiml, že po 3-4 dávkách po
sobě pořád `Zdroje +0 · Schváleno 0`, s hláškou přímo `"Časový rozpočet
(45000ms) vypršel."` (ne jen "před krokem X přeskočeno" jako jinde).
Příčina: `doplnitVyrociZKatalogu` kontrolovala duplicity tak, že pro
KAŽDÝ kandidát (každé album s datem, každé narození, každé úmrtí) poslala
samostatný DB dotaz (`uzExistuje`). U katalogu v řádu stovek záznamů to
bylo stovky sekvenčních DB odezev jen na "už tohle existuje?" – to samo o
sobě dokázalo spolykat celých 45s, takže kroky "dohledání zdrojů" a
"revize" na řadu nepřišly ani jednou, dávku za dávkou.

Oprava (jen `lib/agent/vyroci-z-katalogu.ts`, nahraď + jeho test
`lib/agent/vyroci-z-katalogu.test.ts`, oba nahraď/přepiš): kontrola
duplicit teď natáhne VŠECHNY existující události JEDNÍM dotazem na
začátku běhu a dál kontroluje v paměti. Otestováno 7 testy (3 nové +
4 původní `parsujDatum`) – konkrétně test `"na 50 alb se stejným datem
udělá JEDEN findMany... ne 50"` přímo dokazuje ten rozdíl (dřív 50
dotazů, teď 1). Díky týhle opravě teď navíc v tomhle sandboxu poprvé
prošel i původní `vyroci-z-katalogu.test.ts`, který dřív padal na
chybějícím Prisma enginu (protože teď je celá závislost na Prisma klientovi
v testu mockovaná).

Nahraď/přidej: `lib/agent/vyroci-z-katalogu.ts` a
`lib/agent/vyroci-z-katalogu.test.ts` (oba jsou v `lib/agent/`, druhý
nahrazuje původní testovací soubor stejného jména).

## Zbývající, vědomě neřešené riziko (ne 504, ale stojí za zmínku)

Dodatek 2 výše vyřešil hlavní bolest (N+1 dotazů na duplicity). Zůstává jen
mnohem menší věc: `doplnitVyrociZKatalogu` pořád při KAŽDÉM běhu čte celou
tabulku alb a celou tabulku hudebníků (`prisma.album.findMany`,
`prisma.hudebnik.findMany`, bez stránkování) – u katalogu v řádu tisíců by
i tohle časem mohlo začít něco stát, i když řádově nesrovnatelně méně než
předchozí N+1 problém (jde o dva dotazy místo stovek). Skutečné řešení
(např. stránkování nebo sledování "naposledy zpracováno do") by byla
samostatná úprava datového modelu – mimo rozsah týhle opravy.

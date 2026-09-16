// lib/agent/rozpocet-casu.ts
//
// Sdílený časový rozpočet pro dávkové/cronové operace (auto-doplnovani,
// sdružená kontrola). Řeší problém, který samotné per-volání timeouty
// (EXTERNI_ZDROJ_TIMEOUT_MS, GEMINI_TIMEOUT_MS v lib/constants.ts) sami
// o sobě neřeší: i když je KAŽDÉ jednotlivé síťové volání omezené, sekvence
// desítek takových volání za sebou (víc položek v dávce × víc kroků na
// položku × víc kroků v jednom cronu) se sčítá a snadno přesáhne tvrdý
// strop Vercelu (60 s na Hobby plánu) – to byla skutečná příčina
// opakovaných 504 FUNCTION_INVOCATION_TIMEOUT i po zavedení dílčích
// timeoutů (viz redakční poznámka u EXTERNI_ZDROJ_TIMEOUT_MS).
//
// Řešení: JEDEN sdílený rozpočet na celý HTTP request (vytvořený hned na
// začátku route handleru), provázaný přes AbortController se VŠEMI
// externími voláními (MusicBrainz, Metal Archives, Gemini, rozbalení
// Google redirectu). Když rozpočet vyprší:
//   1) běžící fetch se DOOPRAVDY zruší (signal.abort), ne jen přestane čekat,
//   2) další položky/kroky dávky se vůbec nezačnou (viz vyprsel()),
//   3) funkce se vrátí s tím, co už stihla zjistit/uložit – nikdy nehodí
//      pryč už hotovou práci a nikdy nenechá věc "nezpracovanou" vypadat
//      jako "nenalezenou" (to by u dohledatChybejiciZdroje mohlo vést k
//      mazání záznamů, které jsme jen nestihli zkontrolovat – viz
//      dohledat-zdroj.ts).
//
// Cíl návrhu: i v absolutním nejhorším případě (všechna externí volání
// visí až do svého plného timeoutu) se má funkce vrátit BEZPEČNĚ POD
// stropem maxDuration, s reálnou rezervou na cold start, připojení k
// databázi a závěrečné revalidatePath.

export type RozpocetCasu = {
  /** Signál, který se abortne v okamžiku vypršení rozpočtu (nebo dřív, viz zrusit). */
  readonly signal: AbortSignal;
  /** Kolik ms ještě zbývá do vypršení (nikdy záporně). */
  zbyvaMs(): number;
  /** True, pokud už rozpočet vypršel. */
  vyprsel(): boolean;
  /** Zavolat na konci requestu (uvolní interní setTimeout, ať nic nedrží proces). */
  uklidit(): void;
};

/** Chyba s .name = "TimeoutError", ať ji stávající kontroly (`e.name === "TimeoutError"`
 *  v lib/agent/gemini.ts a případně jinde) rozpoznají stejně, ať vznikla z
 *  per-volání timeoutu, nebo z celkového rozpočtu. */
export function chybaVyprseni(zprava: string): Error {
  const chyba = new Error(zprava);
  chyba.name = "TimeoutError";
  return chyba;
}

export function jeChybaVyprseni(e: unknown): boolean {
  return e instanceof Error && e.name === "TimeoutError";
}

/**
 * Vytvoří nový časový rozpočet o délce `celkemMs`. Volat JEDNOU na začátku
 * route handleru (nebo na začátku samostatně spustitelné akce) a předávat
 * dál – ne vytvářet nový v každé vnořené funkci, jinak by se rozpočty
 * jednotlivých kroků sčítaly místo sdílely.
 */
export function vytvorRozpocet(celkemMs: number): RozpocetCasu {
  const controller = new AbortController();
  const konecV = Date.now() + celkemMs;
  const casovac = setTimeout(() => controller.abort(chybaVyprseni(`Časový rozpočet (${celkemMs}ms) vypršel.`)), celkemMs);
  const sCasovacem = casovac as unknown as { unref?: () => void };
  if (typeof sCasovacem.unref === "function") sCasovacem.unref();

  return {
    signal: controller.signal,
    zbyvaMs: () => Math.max(0, konecV - Date.now()),
    vyprsel: () => controller.signal.aborted || Date.now() >= konecV,
    uklidit: () => clearTimeout(casovac),
  };
}

/**
 * Signál pro JEDNO konkrétní externí volání (fetch): zkrátí per-volání
 * strop (EXTERNI_ZDROJ_TIMEOUT_MS / GEMINI_TIMEOUT_MS) na to, co z
 * celkového rozpočtu ještě reálně zbývá. Když už nezbývá nic, vrátí rovnou
 * už abortnutý signál, ať se volání ani nezkouší poslat po síti.
 *
 * Tohle je náhrada za `AbortSignal.timeout(maxMs)` všude tam, kde je k
 * dispozici sdílený rozpočet – použití je stejné (`{ signal }` do fetch()).
 */
export function signalNaVolani(rozpocet: RozpocetCasu, maxMs: number): AbortSignal {
  const zbyva = rozpocet.zbyvaMs();
  const efektivni = Math.min(maxMs, zbyva);
  const lokalni = new AbortController();

  if (efektivni <= 0) {
    lokalni.abort(chybaVyprseni("Časový rozpočet vyčerpán, volání se nezahajuje."));
    return lokalni.signal;
  }

  const casovac = setTimeout(() => lokalni.abort(chybaVyprseni(`Externí volání překročilo ${efektivni}ms.`)), efektivni);
  const sCasovacem = casovac as unknown as { unref?: () => void };
  if (typeof sCasovacem.unref === "function") sCasovacem.unref();

  const naVyprseniRozpoctu = () => {
    clearTimeout(casovac);
    lokalni.abort(rozpocet.signal.reason ?? chybaVyprseni("Časový rozpočet vypršel."));
  };
  if (rozpocet.signal.aborted) {
    naVyprseniRozpoctu();
  } else {
    rozpocet.signal.addEventListener("abort", naVyprseniRozpoctu, { once: true });
    lokalni.signal.addEventListener("abort", () => clearTimeout(casovac), { once: true });
  }
  return lokalni.signal;
}

/**
 * Omezí, jak dlouho NAŠE VLASTNÍ funkce čeká na `slib` – na rozdíl od
 * `signalNaVolani` ale skutečnou práci uvnitř `slib` nezruší (typicky
 * Prisma dotaz, který AbortSignal nativně nepodporuje). Používat jen pro
 * pár izolovaných DB kontrol mimo hlavní (síťově těžkou) práci, kde je
 * cílem vrátit se s jasnou chybou místo viset až do tvrdého zabití
 * funkce Vercelem – ne jako náhrada za skutečné zrušení.
 */
export function sOmezenymCekanim<T>(slib: Promise<T>, popis: string, maxMs = 8000): Promise<T> {
  return Promise.race([
    slib,
    new Promise<T>((_, reject) => {
      const casovac = setTimeout(() => reject(chybaVyprseni(`${popis}: nedokončeno do ${maxMs / 1000}s.`)), maxMs);
      const sCasovacem = casovac as unknown as { unref?: () => void };
      if (typeof sCasovacem.unref === "function") sCasovacem.unref();
    }),
  ]);
}

/**
 * Výchozí rozpočet pro funkce volané MIMO cron (ruční akce z /kontrola UI),
 * které dnes žádný časový strop nemají vůbec. Použitý jen jako parametr
 * default – když volající (cron route) předá svůj vlastní, sdílený
 * rozpočet, tenhle se nepoužije. Drží se poměrně velkorysý, ať se chování
 * ručních tlačítek v běžném případě nijak nezmění – jde jen o pojistku
 * proti nekonečnému visení, ne o nový tvrdý limit pro editory.
 */
export const VYCHOZI_ROZPOCET_MS = 55_000;

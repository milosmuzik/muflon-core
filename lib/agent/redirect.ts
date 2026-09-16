// lib/agent/redirect.ts
//
// Gemini google_search grounding vrací citace jako Google redirect
// (vertexaisearch.cloud.google.com/grounding-api-redirect/...), ne přímou
// URL zdroje. Bez rozbalení by whitelist domén (RENOMOVANE_ZDROJE_DOMENY)
// nikdy nenašel shodu - hostname by byl vždy Google, ne skutečné médium.

import { EXTERNI_ZDROJ_TIMEOUT_MS } from "@/lib/constants";
import { type RozpocetCasu, signalNaVolani } from "@/lib/agent/rozpocet-casu";

const GOOGLE_REDIRECT_HOST = "vertexaisearch.cloud.google.com";

export function jeGoogleRedirect(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === GOOGLE_REDIRECT_HOST;
  } catch {
    return false;
  }
}

export async function rozbalRedirect(url: string, rozpocet?: RozpocetCasu): Promise<string> {
  if (!url || !jeGoogleRedirect(url)) return url;
  // Rozbalení je jen kosmetické vylepšení citace (viz catch níže) – když už
  // z rozpočtu nic nezbývá, radši vrátit nerozbalenou URL rovnou, než
  // zahajovat další síťové volání, které stejně skončí abortem.
  if (rozpocet?.vyprsel()) return url;
  try {
    let odpoved = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: rozpocet ? signalNaVolani(rozpocet, EXTERNI_ZDROJ_TIMEOUT_MS) : AbortSignal.timeout(EXTERNI_ZDROJ_TIMEOUT_MS),
    });
    if (!odpoved.url || odpoved.url === url) {
      if (rozpocet?.vyprsel()) return url;
      odpoved = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: rozpocet ? signalNaVolani(rozpocet, EXTERNI_ZDROJ_TIMEOUT_MS) : AbortSignal.timeout(EXTERNI_ZDROJ_TIMEOUT_MS),
      });
    }
    return odpoved.url || url;
  } catch {
    // Timeout i jakákoliv jiná chyba: vrátit původní (nerozbalenou) URL místo
    // shození celého volání – rozbalení je jen kosmetické vylepšení citace.
    return url;
  }
}

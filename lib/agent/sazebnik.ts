import { type RozpocetCasu } from "@/lib/agent/rozpocet-casu";

/**
 * Sazebník interních mezer mezi voláními stejné služby v jednom procesu.
 * Gemini grounding má vlastní pacing v rozpocet.ts (1,5 s + denní strop).
 */
export const MEZERA_MS = {
  musicbrainz: 1100,
  metalarchives: 2000,
} as const;

export type SazebniSluzba = keyof typeof MEZERA_MS;

const naposledy: Partial<Record<SazebniSluzba, number>> = {};

const spi = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Počká, aby se dodržela mezera služby. Vrátí false, když by čekání
 * nebo samotné volání už nevešlo do časového rozpočtu — volající má
 * request přeskočit, ne porušit limit.
 */
export async function pockejNaSazbu(
  sluzba: SazebniSluzba,
  rozpocet?: RozpocetCasu,
  rezervaNaVolaniMs = 500
): Promise<boolean> {
  if (rozpocet?.vyprsel()) return false;
  const min = MEZERA_MS[sluzba];
  const predchozi = naposledy[sluzba] ?? 0;
  const cekat = Math.max(0, predchozi + min - Date.now());
  if (cekat > 0) {
    if (rozpocet && rozpocet.zbyvaMs() < cekat + rezervaNaVolaniMs) return false;
    await spi(cekat);
  }
  if (rozpocet?.vyprsel()) return false;
  naposledy[sluzba] = Date.now();
  return true;
}

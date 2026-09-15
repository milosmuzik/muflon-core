import { prisma } from "@/lib/prisma";
import { isoPraha } from "@/lib/cas";

/**
 * Rozpočet pro Gemini volání s web searchem (grounding).
 *
 * Grounding s Google Search má samostatnou denní kvótu (Google: 1500 RPD pro
 * gemini-flash-lite/2.5/2.0), oddělenou od běžného RPM/TPM modelu (to je
 * v řádu tisíců a appka se k němu ani nepřibližuje). Nejvzácnější zdroj je
 * tedy počet GROUNDOVANÝCH volání za den – ten se sleduje tady.
 *
 * Jistič a počítadlo žijí v DB (tabulka GeminiRozpocet), ne jen v paměti
 * procesu: na Vercelu se serverless funkce mezi jednotlivými spuštěními
 * restartují, takže modulová proměnná by "cooldown" po 429 zapomněla hned
 * při dalším studeném startu.
 */

const ID = "singleton";

/** Skutečný denní limit Google pro grounding (RPD). Neměnit bez ověření v AI Studiu. */
export const DENNI_LIMIT_GOOGLE = 1500;

/**
 * Bezpečný strop appky – nižší než skutečný limit Google, aby zbyla rezerva
 * na ruční dotazy (zjisti-vice, jednotlivé karty) a na nečekané nárazy.
 * Lze přebít proměnnou prostředí GEMINI_DENNI_STROP.
 */
export const DENNI_BEZPECNY_STROP = Number(process.env.GEMINI_DENNI_STROP || 1000);

/**
 * Rezerva groundovaných volání vyhrazená MIMO automatické doplňování
 * (katalog/výročí/příběhy v lib/actions/auto-doplnovani.ts) – zůstává volná
 * pro ruční akce na /kontrola (Zjistit více, Doplnit záznam) a nečekané
 * nárazy přes den. Automatika se zastaví, jakmile by ji čerpání dostalo pod
 * tuhle hranici, i kdyby ještě měla co dělat. Lze přebít proměnnou prostředí
 * AUTOMATICKA_REZERVA.
 */
export const AUTOMATICKA_REZERVA = Number(process.env.AUTOMATICKA_REZERVA || 100);

/** Kolik groundovaných volání dnes ještě smí spotřebovat automatika (0, pokud už je v rezervě). */
export async function zbyvaProAutomatiku(): Promise<number> {
  const r = await stavRozpoctu();
  return Math.max(0, r.strop - AUTOMATICKA_REZERVA - r.groundedDnes);
}

/**
 * Minimální mezera mezi dvěma groundovanými voláními. Google v Rate Limit
 * dashboardu pro Search grounding nezobrazuje žádný RPM (jen RPD), ale
 * appka už jednou dostala 429 za nejasných okolností – tohle je levná
 * pojistka proti nezdokumentovanému/burst limitu, aniž by výrazně omezila
 * reálnou propustnost (i 1,5 s mezera dovolí ~2 400 volání/den, násobně
 * víc než bezpečný strop).
 */
const MIN_MEZERA_MS = 1500;

const pauza = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function nacistRadek() {
  const dnes = isoPraha();
  let radek = await prisma.geminiRozpocet.findUnique({ where: { id: ID } });

  if (!radek) {
    radek = await prisma.geminiRozpocet.create({ data: { id: ID, den: dnes, groundedDnes: 0 } });
  } else if (radek.den !== dnes) {
    radek = await prisma.geminiRozpocet.update({
      where: { id: ID },
      data: { den: dnes, groundedDnes: 0 },
    });
  }
  return radek;
}

export type StavRozpoctu = {
  den: string;
  groundedDnes: number;
  strop: number;
  limitGoogle: number;
  zbyva: number;
  obvodDoUtc: Date | null;
  jisticAktivni: boolean;
};

export async function stavRozpoctu(): Promise<StavRozpoctu> {
  const r = await nacistRadek();
  const jisticAktivni = Boolean(r.obvodDoUtc && r.obvodDoUtc.getTime() > Date.now());
  return {
    den: r.den,
    groundedDnes: r.groundedDnes,
    strop: DENNI_BEZPECNY_STROP,
    limitGoogle: DENNI_LIMIT_GOOGLE,
    zbyva: Math.max(0, DENNI_BEZPECNY_STROP - r.groundedDnes),
    obvodDoUtc: r.obvodDoUtc,
    jisticAktivni,
  };
}

/**
 * Zavolat TĚSNĚ PŘED každým groundovaným (web search) voláním Gemini.
 * Vrátí { ok: false } bez vyhazování výjimky – volající (gemini.ts) si podle
 * toho sám vyhodí GeminiQuotaError se srozumitelným důvodem. Pokud je ok,
 * funkce už počkala potřebnou mezeru od posledního volání (pacing).
 */
export async function pripravSeNaGrounded(): Promise<{ ok: true } | { ok: false; duvod: string }> {
  const r = await nacistRadek();

  if (r.obvodDoUtc && r.obvodDoUtc.getTime() > Date.now()) {
    const zbyvaMin = Math.ceil((r.obvodDoUtc.getTime() - Date.now()) / 60000);
    return { ok: false, duvod: `Jistič aktivní ještě ~${zbyvaMin} min (poslední 429/503).` };
  }

  if (r.groundedDnes >= DENNI_BEZPECNY_STROP) {
    return {
      ok: false,
      duvod: `Denní bezpečný strop groundovaných volání vyčerpán (${r.groundedDnes}/${DENNI_BEZPECNY_STROP}, Google limit ${DENNI_LIMIT_GOOGLE}).`,
    };
  }

  if (r.posledniGroundedUtc) {
    const uplynulo = Date.now() - r.posledniGroundedUtc.getTime();
    if (uplynulo < MIN_MEZERA_MS) await pauza(MIN_MEZERA_MS - uplynulo);
  }

  return { ok: true };
}

/** Zavolat PO úspěšném groundovaném volání – zapíše spotřebu a čas pro pacing. */
export async function zaznamenejGrounded(): Promise<void> {
  const dnes = isoPraha();
  const r = await nacistRadek();
  await prisma.geminiRozpocet.update({
    where: { id: ID },
    data:
      r.den === dnes
        ? { groundedDnes: { increment: 1 }, posledniGroundedUtc: new Date() }
        : { den: dnes, groundedDnes: 1, posledniGroundedUtc: new Date() },
  });
}

/** Zavolat při 429/503 – zavře jistič na `ms` a přetrvá to i přes studený start. */
export async function zavriJistic(ms: number): Promise<void> {
  await nacistRadek();
  await prisma.geminiRozpocet.update({
    where: { id: ID },
    data: { obvodDoUtc: new Date(Date.now() + ms) },
  });
}

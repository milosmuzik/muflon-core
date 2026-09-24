import { prisma } from "@/lib/prisma";
import { isoPraha } from "@/lib/cas";

/**
 * Rozpočet pro Gemini volání s web searchem (grounding).
 *
 * Groundovaná volání jsou nejvzácnější (a potenciálně placený) zdroj appky,
 * proto se jejich počet za den sleduje tady. Pozor: skutečný bezplatný
 * limit a cena groundingu se liší podle modelu (viz GEMINI_MODEL v
 * gemini.ts) – DENNI_LIMIT_GOOGLE níž platí pro modely řady 2.5, u novějších
 * modelů může být limit měsíční a účtovat se každý vyhledávací dotaz.
 *
 * Jistič a počítadlo žijí v DB (tabulka GeminiRozpocet), ne jen v paměti
 * procesu: na Vercelu se serverless funkce mezi jednotlivými spuštěními
 * restartují, takže modulová proměnná by "cooldown" po 429 zapomněla hned
 * při dalším studeném startu.
 *
 * Volání se započítává PŘED odesláním (atomická rezervace v DB), ne až po
 * úspěchu: i volání, které skončí timeoutem, mohl Google zpracovat a
 * zaúčtovat, a dvě souběžně běžící funkce (cron + ruční akce) tak nemůžou
 * strop přetáhnout.
 */

const ID = "singleton";

/** Denní limit Google pro grounding u modelů řady 2.5 (RPD). Neměnit bez ověření v AI Studiu. */
export const DENNI_LIMIT_GOOGLE = 1500;

/**
 * Bezpečný strop appky – nižší než limit Google, aby zbyla rezerva na ruční
 * dotazy (Zjistit více, jednotlivé karty) a na nečekané nárazy.
 * Lze přebít proměnnou prostředí GEMINI_DENNI_STROP.
 */
export const DENNI_BEZPECNY_STROP = Number(process.env.GEMINI_DENNI_STROP || 1200);

/**
 * Rezerva groundovaných volání vyhrazená MIMO automatické doplňování
 * (katalog/výročí/příběhy v lib/actions/auto-doplnovani.ts) – zůstává volná
 * pro ruční akce na /kontrola (Zjistit více, Doplnit záznam) a nečekané
 * nárazy přes den. Automatika se zastaví, jakmile by ji čerpání dostalo pod
 * tuhle hranici, i kdyby ještě měla co dělat. Lze přebít proměnnou prostředí
 * AUTOMATICKA_REZERVA.
 */
export const AUTOMATICKA_REZERVA = Number(process.env.AUTOMATICKA_REZERVA || 80);

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
 * reálnou propustnost.
 */
const MIN_MEZERA_MS = 1500;

const pauza = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function nacistRadek() {
  const dnes = isoPraha();
  let radek = await prisma.geminiRozpocet.findUnique({ where: { id: ID } });

  if (!radek) {
    radek = await prisma.geminiRozpocet.upsert({
      where: { id: ID },
      create: { id: ID, den: dnes, groundedDnes: 0 },
      update: {},
    });
  }
  if (radek.den !== dnes) {
    // Podmíněný update: reset proběhne jen jednou, i když o půlnoci běží dvě funkce najednou.
    await prisma.geminiRozpocet.updateMany({
      where: { id: ID, den: radek.den },
      data: { den: dnes, groundedDnes: 0 },
    });
    radek = await prisma.geminiRozpocet.findUniqueOrThrow({ where: { id: ID } });
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

function duvodStropu(groundedDnes: number): string {
  return `Denní bezpečný strop groundovaných volání vyčerpán (${groundedDnes}/${DENNI_BEZPECNY_STROP}, Google limit ${DENNI_LIMIT_GOOGLE}).`;
}

/**
 * Zavolat TĚSNĚ PŘED každým groundovaným (web search) voláním Gemini.
 * Počká na pacing mezeru a pak ATOMICKY zarezervuje jedno volání z denního
 * stropu (podmíněný UPDATE v DB – projde jen tehdy, když je strop ještě
 * volný a jistič zavřený). Vrátí { ok: false } bez vyhazování výjimky –
 * volající (gemini.ts) si podle toho sám vyhodí GeminiQuotaError.
 */
export async function pripravSeNaGrounded(): Promise<{ ok: true } | { ok: false; duvod: string }> {
  const r = await nacistRadek();

  if (r.obvodDoUtc && r.obvodDoUtc.getTime() > Date.now()) {
    const zbyvaMin = Math.ceil((r.obvodDoUtc.getTime() - Date.now()) / 60000);
    return { ok: false, duvod: `Jistič aktivní ještě ~${zbyvaMin} min (poslední 429/503).` };
  }
  if (r.groundedDnes >= DENNI_BEZPECNY_STROP) {
    return { ok: false, duvod: duvodStropu(r.groundedDnes) };
  }

  if (r.posledniGroundedUtc) {
    const uplynulo = Date.now() - r.posledniGroundedUtc.getTime();
    if (uplynulo < MIN_MEZERA_MS) await pauza(MIN_MEZERA_MS - uplynulo);
  }

  const ted = new Date();
  const rezervace = await prisma.geminiRozpocet.updateMany({
    where: {
      id: ID,
      den: r.den,
      groundedDnes: { lt: DENNI_BEZPECNY_STROP },
      OR: [{ obvodDoUtc: null }, { obvodDoUtc: { lte: ted } }],
    },
    data: { groundedDnes: { increment: 1 }, posledniGroundedUtc: ted },
  });
  if (rezervace.count === 1) return { ok: true };

  // Mezitím strop vyčerpala jiná funkce, zavřel se jistič, nebo přešla půlnoc – zjistit proč.
  const znovu = await nacistRadek();
  if (znovu.obvodDoUtc && znovu.obvodDoUtc.getTime() > Date.now()) {
    return { ok: false, duvod: "Jistič se právě zavřel (429/503 v jiném běhu)." };
  }
  if (znovu.groundedDnes >= DENNI_BEZPECNY_STROP) {
    return { ok: false, duvod: duvodStropu(znovu.groundedDnes) };
  }
  // Přechod přes půlnoc – nový den má volno, zkusit rezervovat ještě jednou.
  const druhyPokus = await prisma.geminiRozpocet.updateMany({
    where: { id: ID, den: znovu.den, groundedDnes: { lt: DENNI_BEZPECNY_STROP } },
    data: { groundedDnes: { increment: 1 }, posledniGroundedUtc: new Date() },
  });
  return druhyPokus.count === 1 ? { ok: true } : { ok: false, duvod: "Rezervace groundovaného volání se nepodařila." };
}

/** Zavolat při 429/503 – zavře jistič na `ms` a přetrvá to i přes studený start. */
export async function zavriJistic(ms: number): Promise<void> {
  await nacistRadek();
  await prisma.geminiRozpocet.update({
    where: { id: ID },
    data: { obvodDoUtc: new Date(Date.now() + ms) },
  });
}

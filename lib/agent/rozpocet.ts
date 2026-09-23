import { prisma } from "@/lib/prisma";
import { isoPraha } from "@/lib/cas";

const ID = "singleton";

/** Skutečný denní limit Google pro grounding (RPD). Neměnit bez ověření v AI Studiu. */
export const DENNI_LIMIT_GOOGLE = 1500;

/**
 * Bezpečný strop appky – pod Google 1500 RPD. Rezerva je na ruční
 * Zjistit více a na náraz po 429. Přebíjí GEMINI_DENNI_STROP.
 */
export const DENNI_BEZPECNY_STROP = Number(process.env.GEMINI_DENNI_STROP || 1200);

/** Rezerva mimo automatiku. Přebíjí AUTOMATICKA_REZERVA. */
export const AUTOMATICKA_REZERVA = Number(process.env.AUTOMATICKA_REZERVA || 80);

export async function zbyvaProAutomatiku(): Promise<number> {
  const r = await stavRozpoctu();
  return Math.max(0, r.strop - AUTOMATICKA_REZERVA - r.groundedDnes);
}

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

export async function zavriJistic(ms: number): Promise<void> {
  await nacistRadek();
  await prisma.geminiRozpocet.update({
    where: { id: ID },
    data: { obvodDoUtc: new Date(Date.now() + ms) },
  });
}

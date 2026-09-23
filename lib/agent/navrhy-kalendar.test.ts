import { describe, expect, it, vi, beforeEach } from "vitest";
import type { RozpocetCasu } from "./rozpocet-casu";

function mmddPro(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const existujiciPodleData: Record<string, { nazev: string; stav: string }[]> = {};
const findManyMock = vi.fn(async ({ where }: { where: { datum: string } }) => existujiciPodleData[where.datum] ?? []);
const createMock = vi.fn(async ({ data }: { data: { nazev: string } }) => ({ id: `id-${Math.random()}`, nazev: data.nazev }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    udalost: { findMany: (...a: unknown[]) => (findManyMock as (...a: unknown[]) => unknown)(...a), create: (...a: unknown[]) => (createMock as (...a: unknown[]) => unknown)(...a) },
    zdroj: { create: vi.fn(async () => ({})) },
    historieZmeny: { create: vi.fn(async () => ({})) },
  },
}));

vi.mock("./redirect", () => ({ rozbalRedirect: vi.fn(async (url: string) => url) }));
vi.mock("./duplicity", () => ({ jsouDuplicitni: () => false }));

const zavolejGeminiMock = vi.fn();
class GeminiQuotaErrorMock extends Error {
  constructor(message = "kvóta") {
    super(message);
    this.name = "GeminiQuotaError";
  }
}
vi.mock("./gemini", () => ({
  GeminiQuotaError: GeminiQuotaErrorMock,
  geminiJeDostupne: () => true,
  jeKvotaChyba: (e: unknown) => e instanceof GeminiQuotaErrorMock,
  vytahniJson: (text: string) => JSON.parse(text),
  zavolejGemini: (...args: unknown[]) => zavolejGeminiMock(...args),
}));

const { vygenerovatNavrhyKalendare } = await import("./navrhy-kalendar");

function falesnyRozpocet(vyprsiPoNKontrolach: number): RozpocetCasu {
  let pocet = 0;
  return {
    signal: new AbortController().signal,
    zbyvaMs: () => (pocet < vyprsiPoNKontrolach ? 99_999 : 0),
    vyprsel: () => {
      pocet++;
      return pocet > vyprsiPoNKontrolach;
    },
    uklidit: () => {},
  };
}

beforeEach(() => {
  for (const k of Object.keys(existujiciPodleData)) delete existujiciPodleData[k];
  findManyMock.mockClear();
  createMock.mockClear();
  zavolejGeminiMock.mockReset();
  zavolejGeminiMock.mockResolvedValue("[]");
});

describe("vygenerovatNavrhyKalendare – zpětná kontrola posledních dní", () => {
  it("zkontroluje dnešek + 5 dní zpátky (6 celkem), když žádný den nemá dost událostí a čas stačí", async () => {
    const vysledek = await vygenerovatNavrhyKalendare(1, falesnyRozpocet(999));

    expect(zavolejGeminiMock).toHaveBeenCalledTimes(6);
    expect(findManyMock).toHaveBeenCalledTimes(6);
    expect(vysledek.zpracovanoDni).toBe(6);
    expect(vysledek.chyby).toEqual([]);
  });

  it("den, který už má dost živých událostí, přeskočí BEZ volání Gemini", async () => {
    existujiciPodleData[mmddPro(0)] = [
      { nazev: "a", stav: "schvaleno" },
      { nazev: "b", stav: "publikovano" },
      { nazev: "c", stav: "navrh" },
    ];

    const vysledek = await vygenerovatNavrhyKalendare(1, falesnyRozpocet(999));

    expect(zavolejGeminiMock).toHaveBeenCalledTimes(5);
    expect(vysledek.preskoceno).toBe(3);
  });

  it("den plný jen archivovaných událostí se stále doplňuje", async () => {
    existujiciPodleData[mmddPro(0)] = [
      { nazev: "staré 1", stav: "archivovano" },
      { nazev: "staré 2", stav: "archivovano" },
      { nazev: "staré 3", stav: "archivovano" },
    ];

    await vygenerovatNavrhyKalendare(1, falesnyRozpocet(999));

    expect(zavolejGeminiMock).toHaveBeenCalledTimes(6);
  });

  it("dnešek se kontroluje PŘED zpětnými dny (pořadí offsetů)", async () => {
    const volaneMmdd: string[] = [];
    findManyMock.mockImplementation(async ({ where }: { where: { datum: string } }) => {
      volaneMmdd.push(where.datum);
      return [];
    });

    await vygenerovatNavrhyKalendare(1, falesnyRozpocet(999));

    expect(volaneMmdd[0]).toBe(mmddPro(0));
    expect(volaneMmdd).toEqual([mmddPro(0), mmddPro(-1), mmddPro(-2), mmddPro(-3), mmddPro(-4), mmddPro(-5)]);
  });

  it("když rozpočet vyprší uprostřed zpětné kontroly, zbytek dní se vůbec nezkusí", async () => {
    const vysledek = await vygenerovatNavrhyKalendare(1, falesnyRozpocet(2));

    expect(zavolejGeminiMock).toHaveBeenCalledTimes(2);
    expect(vysledek.chyby.some((c) => c.includes("Časový rozpočet vyčerpán"))).toBe(true);
  });
});

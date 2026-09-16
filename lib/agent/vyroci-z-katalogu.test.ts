import { describe, expect, it, vi, beforeEach } from "vitest";

const udalostFindManyMock = vi.fn();
const udalostCreateMock = vi.fn(async ({ data }: { data: { nazev: string; datum: string } }) => ({
  id: `u-${Math.random()}`,
  nazev: data.nazev,
  datum: data.datum,
}));
const albumFindManyMock = vi.fn();
const hudebnikFindManyMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    udalost: {
      findMany: (...a: unknown[]) => udalostFindManyMock(...a),
      create: (...a: unknown[]) => udalostCreateMock(...a),
    },
    album: { findMany: (...a: unknown[]) => albumFindManyMock(...a) },
    hudebnik: { findMany: (...a: unknown[]) => hudebnikFindManyMock(...a) },
    vazba: { create: vi.fn(async () => ({})) },
    zdroj: { create: vi.fn(async () => ({})) },
    historieZmeny: { create: vi.fn(async () => ({})) },
  },
}));

vi.mock("@/lib/agent/duplicity", () => ({
  jsouDuplicitni: (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase(),
}));

vi.mock("@/lib/agent/databaze", () => ({
  faktaZMusicBrainzAlbum: vi.fn().mockResolvedValue(null),
  faktaZMusicBrainzHudebnik: vi.fn().mockResolvedValue(null),
}));

const { doplnitVyrociZKatalogu, parsujDatum } = await import("./vyroci-z-katalogu");
const { vytvorRozpocet } = await import("./rozpocet-casu");

describe("parsujDatum", () => {
  it("čte ISO den", () => {
    expect(parsujDatum("2014-09-09")).toEqual({ mmdd: "09-09", rok: 2014 });
  });
  it("čte české datum", () => {
    expect(parsujDatum("9. 9. 2014")).toEqual({ mmdd: "09-09", rok: 2014 });
  });
  it("rok bez dne kalendář nevyrobí", () => {
    expect(parsujDatum("2014")).toEqual({ rok: 2014 });
  });
  it("prázdné", () => {
    expect(parsujDatum(null)).toEqual({});
  });
});

describe("doplnitVyrociZKatalogu – index existujících událostí (výkon)", () => {
  beforeEach(() => {
    udalostFindManyMock.mockReset();
    udalostCreateMock.mockClear();
    albumFindManyMock.mockReset();
    hudebnikFindManyMock.mockReset();
    albumFindManyMock.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if ("datumVydani" in where && (where as { datumVydani?: { not: unknown } }).datumVydani?.not === null) {
        return ALBA_S_DATEM;
      }
      return []; // albaBezDne
    });
    hudebnikFindManyMock.mockResolvedValue([]);
    udalostFindManyMock.mockResolvedValue([]); // žádné existující události na začátku
  });

  const ALBA_S_DATEM = Array.from({ length: 50 }, (_, i) => ({
    id: `alb-${i}`,
    nazev: `Album ${i}`,
    datumVydani: "2020-01-15",
    vydavatel: null,
    interpreti: [{ interpret: { id: `int-${i}`, nazev: `Kapela ${i}` } }],
  }));

  it("na 50 alb se stejným datem udělá JEDEN findMany na existující události, ne 50", async () => {
    const r = vytvorRozpocet(60_000);
    const vysledek = await doplnitVyrociZKatalogu(6, r);

    // Dřívější uzExistuje() by tu udělalo 50 volání (1 na album) - teď 1
    // (index se natáhne jednou na začátku).
    expect(udalostFindManyMock).toHaveBeenCalledTimes(1);
    expect(vysledek.alba).toBe(50);
    expect(vysledek.chyby).toEqual([]);
    r.uklidit();
  });

  it("duplicita v RÁMCI JEDNOHO běhu se pozná z indexu v paměti, ne z další DB kontroly", async () => {
    albumFindManyMock.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if ("datumVydani" in where && (where as { datumVydani?: { not: unknown } }).datumVydani?.not === null) {
        return [
          { id: "a1", nazev: "Legends", datumVydani: "2020-01-15", vydavatel: null, interpreti: [{ interpret: { id: "i1", nazev: "Metallica" } }] },
          { id: "a2", nazev: "Legends", datumVydani: "2020-01-15", vydavatel: null, interpreti: [{ interpret: { id: "i1", nazev: "Metallica" } }] },
        ];
      }
      return [];
    });

    const r = vytvorRozpocet(60_000);
    const vysledek = await doplnitVyrociZKatalogu(6, r);

    expect(vysledek.alba).toBe(1); // druhé album je duplicita, nezaloží se znovu
    expect(vysledek.preskoceno).toBe(1);
    expect(udalostCreateMock).toHaveBeenCalledTimes(1);
    expect(udalostFindManyMock).toHaveBeenCalledTimes(1);
    r.uklidit();
  });

  it("časový rozpočet vyčerpaný před začátkem vrátí prázdný výsledek bez jakéhokoli DB dotazu", async () => {
    const r = vytvorRozpocet(0);
    await new Promise((res) => setTimeout(res, 5));

    const vysledek = await doplnitVyrociZKatalogu(6, r);

    expect(vysledek).toEqual({ alba: 0, hudebnici: 0, doplnenaData: 0, preskoceno: 0, chyby: [] });
    expect(udalostFindManyMock).not.toHaveBeenCalled();
    expect(albumFindManyMock).not.toHaveBeenCalled();
    r.uklidit();
  });
});

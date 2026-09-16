import { describe, expect, it, vi } from "vitest";
import { vytvorRozpocet } from "./rozpocet-casu";

// ./databaze a ./gemini se mockují, ať test běží bez sítě a bez Prisma
// (zavolejGemini v reálném gemini.ts transitivně importuje @/lib/prisma
// přes @/lib/agent/rozpocet, což by v testovacím prostředí bez vygenerovaného
// Prisma klienta spadlo) - testuje se čistě LOGIKA rozlišení "nenalezeno" vs
// "nezpracováno kvůli časovému rozpočtu" v dohledat-zdroj.ts samotném.
vi.mock("./databaze", () => ({
  najdiKapeluNaMetalArchives: vi.fn().mockResolvedValue(null),
  najdiAlbaNaMetalArchives: vi.fn().mockResolvedValue(null),
  najdiHudebnikaNaMetalArchives: vi.fn().mockResolvedValue(null),
}));

vi.mock("./redirect", () => ({
  rozbalRedirect: vi.fn(async (url: string) => url),
}));

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

const { dohledatZdrojeVDavce } = await import("./dohledat-zdroj");

describe("dohledatZdrojeVDavce – nenalezeno vs. nezpracováno (kritické pro bezpečnost mazání)", () => {
  it("když rozpočet vyprší PŘED zahájením, VŠE skončí v nezpracovano, nic v vysledky", async () => {
    const r = vytvorRozpocet(0);
    // rozpočet s 0ms je v praxi okamžitě vypršelý
    await new Promise((res) => setTimeout(res, 5));

    const { vysledky, nezpracovano } = await dohledatZdrojeVDavce(
      [
        { klic: "Pribeh:1", nazev: "A", obsah: "a" },
        { klic: "Udalost:2", nazev: "B", obsah: "b" },
      ],
      r
    );

    expect(vysledky.size).toBe(0);
    expect(nezpracovano.has("Pribeh:1")).toBe(true);
    expect(nezpracovano.has("Udalost:2")).toBe(true);
    expect(zavolejGeminiMock).not.toHaveBeenCalled();
    r.uklidit();
  });

  it("Gemini explicitně vrátí nalezeno:false → je to opravdu 'nenalezeno' (smí se smazat)", async () => {
    zavolejGeminiMock.mockResolvedValueOnce(
      JSON.stringify([{ klic: "Pribeh:1", nalezeno: false }])
    );
    const r = vytvorRozpocet(60_000);

    const { vysledky, nezpracovano } = await dohledatZdrojeVDavce(
      [{ klic: "Pribeh:1", nazev: "A", obsah: "a" }],
      r
    );

    expect(nezpracovano.has("Pribeh:1")).toBe(false);
    expect(vysledky.get("Pribeh:1")).toBeNull(); // genuinely "not found"
    r.uklidit();
  });

  it("když Gemini na položku ZAPOMENE (chybí v odpovědi), NENÍ to 'nenalezeno' - jde do nezpracovano", async () => {
    zavolejGeminiMock.mockResolvedValueOnce(
      JSON.stringify([{ klic: "Pribeh:1", nalezeno: false }])
      // Pribeh:2 v odpovědi chybí úplně
    );
    const r = vytvorRozpocet(60_000);

    const { vysledky, nezpracovano } = await dohledatZdrojeVDavce(
      [
        { klic: "Pribeh:1", nazev: "A", obsah: "a" },
        { klic: "Pribeh:2", nazev: "B", obsah: "b" },
      ],
      r
    );

    expect(vysledky.get("Pribeh:1")).toBeNull();
    expect(vysledky.has("Pribeh:2")).toBe(false);
    expect(nezpracovano.has("Pribeh:2")).toBe(true); // NE smazat, zkusit příště
    r.uklidit();
  });

  it("když volání Gemini shodí časový rozpočet (AbortError), CELÁ dávka jde do nezpracovano, ne do 'nenalezeno'", async () => {
    const chyba = new Error("Externí volání překročilo Xms.");
    chyba.name = "TimeoutError";
    zavolejGeminiMock.mockRejectedValueOnce(chyba);
    const r = vytvorRozpocet(60_000);

    const { vysledky, nezpracovano } = await dohledatZdrojeVDavce(
      [
        { klic: "Pribeh:1", nazev: "A", obsah: "a" },
        { klic: "Pribeh:2", nazev: "B", obsah: "b" },
      ],
      r
    );

    expect(vysledky.size).toBe(0);
    expect(nezpracovano.has("Pribeh:1")).toBe(true);
    expect(nezpracovano.has("Pribeh:2")).toBe(true);
    r.uklidit();
  });

  it("kvótová chyba se propaguje ven (zachování původního chování - volající vše zahodí)", async () => {
    zavolejGeminiMock.mockRejectedValueOnce(new GeminiQuotaErrorMock());
    const r = vytvorRozpocet(60_000);

    await expect(
      dohledatZdrojeVDavce([{ klic: "Pribeh:1", nazev: "A", obsah: "a" }], r)
    ).rejects.toBeInstanceOf(GeminiQuotaErrorMock);
    r.uklidit();
  });
});

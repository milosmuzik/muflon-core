import { describe, expect, it, vi } from "vitest";
import { chybaVyprseni, jeChybaVyprseni, signalNaVolani, sOmezenymCekanim, vytvorRozpocet } from "./rozpocet-casu";

describe("chybaVyprseni / jeChybaVyprseni", () => {
  it("vytvoří chybu s name TimeoutError, kterou jeChybaVyprseni pozná", () => {
    const e = chybaVyprseni("test");
    expect(e.name).toBe("TimeoutError");
    expect(jeChybaVyprseni(e)).toBe(true);
  });

  it("nepozná běžnou chybu jako vypršení", () => {
    expect(jeChybaVyprseni(new Error("něco jiného"))).toBe(false);
    expect(jeChybaVyprseni("řetězec, ne Error")).toBe(false);
  });
});

describe("vytvorRozpocet", () => {
  it("vyprsel() je false hned po vytvoření a zbyvaMs() je kladné", () => {
    const r = vytvorRozpocet(10_000);
    expect(r.vyprsel()).toBe(false);
    expect(r.zbyvaMs()).toBeGreaterThan(0);
    expect(r.zbyvaMs()).toBeLessThanOrEqual(10_000);
    r.uklidit();
  });

  it("signal se abortne a vyprsel() vrátí true po uplynutí rozpočtu", async () => {
    vi.useFakeTimers();
    const r = vytvorRozpocet(1000);
    expect(r.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(r.signal.aborted).toBe(true);
    expect(r.vyprsel()).toBe(true);
    r.uklidit();
    vi.useRealTimers();
  });

  it("zbyvaMs() nikdy nejde do záporu", async () => {
    vi.useFakeTimers();
    const r = vytvorRozpocet(500);
    await vi.advanceTimersByTimeAsync(5000);
    expect(r.zbyvaMs()).toBe(0);
    r.uklidit();
    vi.useRealTimers();
  });
});

describe("signalNaVolani", () => {
  it("vrátí signál, který se NEabortne dřív, než uplyne min(maxMs, zbyvaMs)", async () => {
    vi.useFakeTimers();
    const r = vytvorRozpocet(60_000); // rozpočet má spoustu času
    const s = signalNaVolani(r, 5000); // ale tohle konkrétní volání má strop 5s
    expect(s.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(4999);
    expect(s.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(s.aborted).toBe(true);
    r.uklidit();
    vi.useRealTimers();
  });

  it("zkrátí per-volání strop, když z celkového rozpočtu zbývá míň", async () => {
    vi.useFakeTimers();
    const r = vytvorRozpocet(2000); // rozpočet vyprší za 2s
    const s = signalNaVolani(r, 8000); // volání by chtělo klidně 8s
    expect(s.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2000); // rozpočet vyprší dřív než per-volání strop
    expect(s.aborted).toBe(true); // signál se MUSÍ abortnout spolu s rozpočtem, ne až za 8s
    r.uklidit();
    vi.useRealTimers();
  });

  it("když už rozpočet vypršel, vrátí rovnou abortnutý signál", () => {
    vi.useFakeTimers();
    const r = vytvorRozpocet(100);
    vi.advanceTimersByTime(200);
    const s = signalNaVolani(r, 8000);
    expect(s.aborted).toBe(true);
    r.uklidit();
    vi.useRealTimers();
  });
});

describe("sOmezenymCekanim", () => {
  it("vrátí výsledek slibu, pokud stihne doběhnout včas", async () => {
    const vysledek = await sOmezenymCekanim(Promise.resolve(42), "test", 1000);
    expect(vysledek).toBe(42);
  });

  it("odmítne s chybou TimeoutError, pokud slib nestihne doběhnout", async () => {
    vi.useFakeTimers();
    const visici = new Promise(() => {}); // nikdy se nevyřeší - simuluje zaseknutý DB dotaz
    const vysledekPromise = sOmezenymCekanim(visici, "pomalá DB", 1000);
    const asertacePromise = expect(vysledekPromise).rejects.toThrow(/nedokončeno do 1s/);
    await vi.advanceTimersByTimeAsync(1000);
    await asertacePromise;
    vi.useRealTimers();
  });
});

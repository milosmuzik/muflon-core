import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizuj, shodaNazvu, najdiKapeluNaMetalArchives, faktaZMusicBrainzHudebnik } from "./databaze";
import { vytvorRozpocet } from "./rozpocet-casu";

describe("shoda názvů databází", () => {
  it("ignoruje diakritiku a The", () => {
    expect(shodaNazvu("Slayer", "slayer")).toBe(true);
    expect(normalizuj("Mötley Crüe")).toBe("motley crue");
  });

  it("nerovná různé kapely", () => {
    expect(shodaNazvu("Slayer", "Death Slayer")).toBe(false);
  });
});

describe("rozpočtem chráněná externí volání (Metal Archives / MusicBrainz)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("když už rozpočet vypršel, funkce se vrátí BEZ jakéhokoliv fetch()", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    vi.useFakeTimers();
    const r = vytvorRozpocet(100);
    vi.advanceTimersByTime(200); // rozpočet je teď vyčerpaný

    const vysledek = await najdiKapeluNaMetalArchives("Metallica", r);

    expect(vysledek).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    r.uklidit();
  });

  it("skutečně PŘERUŠÍ visící fetch, jakmile rozpočet vyprší (ne jen přestane čekat)", async () => {
    let zachycenySignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      zachycenySignal = init?.signal as AbortSignal;
      // Simuluje MusicBrainz/Metal Archives, který nikdy neodpoví - reálná
      // hrozba, kterou má rozpočet krýt.
      return new Promise(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);

    vi.useFakeTimers();
    const r = vytvorRozpocet(1000);
    const volaniPromise = faktaZMusicBrainzHudebnik("Nějaký Hudebník", r);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(zachycenySignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    // Signál předaný do fetch() se MUSÍ abortnout přesně v okamžiku, kdy
    // vyprší celkový rozpočet - fetch by tak měl reálnou šanci volání
    // doopravdy zrušit, ne jen zůstat viset na pozadí.
    expect(zachycenySignal?.aborted).toBe(true);

    r.uklidit();
    // volaniPromise samo o sobě zůstává nevyřešené (fetch mock nikdy
    // nerezolvuje/nezamítne) - to je v pořádku, ověřujeme jen chování
    // signálu, ne návratovou hodnotu při reálně zaseknutém fetchi.
    void volaniPromise;
  });
});

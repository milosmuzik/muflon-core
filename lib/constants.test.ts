import { describe, expect, it } from "vitest";
import { nazevZeZdroje, urovenDuveryPriorita, urovenDuveryZeZdroje } from "./constants";

describe("urovenDuveryZeZdroje", () => {
  it("dá vysokou důvěru renomovanému médiu z whitelistu", () => {
    expect(urovenDuveryZeZdroje("media", "https://www.loudwire.com/some-article")).toBe("vysoka");
  });

  it("dá vysokou důvěru renomované databázi z whitelistu", () => {
    expect(urovenDuveryZeZdroje("databaze", "https://www.metal-archives.com/bands/x/1")).toBe("vysoka");
  });

  it("dá vysokou důvěru nově doplněným médiím z whitelistu", () => {
    expect(urovenDuveryZeZdroje("media", "https://ultimateclassicrock.com/some-article")).toBe("vysoka");
    expect(urovenDuveryZeZdroje("media", "https://fakker.cz/clanek")).toBe("vysoka");
  });

  it("nedá vysokou důvěru médiu mimo whitelist, i když je to skutečná URL", () => {
    expect(urovenDuveryZeZdroje("media", "https://en.wikipedia.org/wiki/Mercyful_Fate")).toBe("neoverene");
  });

  it("nedá vysokou důvěru Google grounding redirectu - hostname je Google, ne médium", () => {
    // Přesně případ, který způsobil dnešní bug: whitelist match selže, protože
    // URL vede na vertexaisearch.cloud.google.com, ne na skutečnou doménu.
    expect(
      urovenDuveryZeZdroje("media", "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc123")
    ).toBe("neoverene");
  });

  it("dá vysokou důvěru oficiálnímu webu i mimo whitelist", () => {
    expect(urovenDuveryZeZdroje("oficialni_web", "https://kapela-neznama.cz")).toBe("vysoka");
  });

  it("dá střední důvěru databázi mimo whitelist (MusicBrainz apod.)", () => {
    expect(urovenDuveryZeZdroje("databaze", "https://musicbrainz.org/artist/x")).toBe("stredni");
  });
});

describe("urovenDuveryPriorita", () => {
  it("řadí úrovně vzestupně podle důvěryhodnosti", () => {
    expect(urovenDuveryPriorita("neoverene")).toBeLessThan(urovenDuveryPriorita("nizka"));
    expect(urovenDuveryPriorita("nizka")).toBeLessThan(urovenDuveryPriorita("stredni"));
    expect(urovenDuveryPriorita("stredni")).toBeLessThan(urovenDuveryPriorita("vysoka"));
  });
});

describe("nazevZeZdroje", () => {
  it("vrátí přátelský název pro známou doménu, i když AI tvrdila jinak", () => {
    // Přesně dnešní bug: AI zdroj pojmenovala "Loudwire", skutečná URL vedla
    // na Wikipedii - zobrazovaný název musí odpovídat realitě, ne tvrzení AI.
    expect(nazevZeZdroje("https://en.wikipedia.org/wiki/Mercyful_Fate", "Loudwire")).toBe("Wikipedia");
  });

  it("vrátí přátelský název pro renomované médium", () => {
    expect(nazevZeZdroje("https://www.loudwire.com/article", "cokoliv")).toBe("Loudwire");
  });

  it("u neznámé domény vrátí aspoň doménu samotnou, ne tvrzení AI", () => {
    expect(nazevZeZdroje("https://www.nejaky-neznamy-blog.example/x", "Vymyšlené jméno")).toBe(
      "nejaky-neznamy-blog.example"
    );
  });

  it("u nerozebratelné/chybějící URL se vrátí k původnímu názvu", () => {
    expect(nazevZeZdroje(null, "Původní název")).toBe("Původní název");
    expect(nazevZeZdroje("neplatna-url", "Původní název")).toBe("Původní název");
  });
});

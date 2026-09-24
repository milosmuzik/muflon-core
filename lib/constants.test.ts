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

describe("urovenDuveryZeZdroje – whitelist místo tvrzení AI", () => {
  it("oficiální web na Wikipedii nebo databázi nedostane vysokou důvěru", () => {
    expect(urovenDuveryZeZdroje("oficialni_web", "https://en.wikipedia.org/wiki/Alter_Bridge")).toBe("neoverene");
    expect(urovenDuveryZeZdroje("oficialni_web", "https://www.discogs.com/artist/1")).toBe("neoverene");
    expect(urovenDuveryZeZdroje("oficialni_web", "https://kapela.fandom.com/wiki/x")).toBe("neoverene");
  });

  it("oficiální web na vlastní doméně kapely vysokou důvěru dostane", () => {
    expect(urovenDuveryZeZdroje("oficialni_web", "https://www.alterbridge.com/news")).toBe("vysoka");
  });

  it("sociální síť musí být opravdu na doméně sociální sítě", () => {
    expect(urovenDuveryZeZdroje("socialni_site", "https://www.facebook.com/alterbridge")).toBe("vysoka");
    expect(urovenDuveryZeZdroje("socialni_site", "https://m.youtube.com/watch?v=x")).toBe("vysoka");
    expect(urovenDuveryZeZdroje("socialni_site", "https://nejaky-blog.cz/clanek")).toBe("nizka");
  });

  it("oficiální web na sociální síti se hodnotí jako sociální síť", () => {
    expect(urovenDuveryZeZdroje("oficialni_web", "https://instagram.com/kapela")).toBe("vysoka");
  });

  it("nerozbalený Google redirect nedostane vysokou důvěru v žádné kategorii", () => {
    const redirect = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc";
    expect(urovenDuveryZeZdroje("oficialni_web", redirect)).toBe("neoverene");
    expect(urovenDuveryZeZdroje("socialni_site", redirect)).toBe("neoverene");
  });

  it("nesmyslná nebo ne-http URL nedostane vysokou důvěru", () => {
    expect(urovenDuveryZeZdroje("oficialni_web", "neni-to-url")).toBe("neoverene");
    expect(urovenDuveryZeZdroje("oficialni_web", "ftp://kapela.cz")).toBe("neoverene");
  });

  it("doména z whitelistu má vysokou důvěru v jakékoliv kategorii", () => {
    expect(urovenDuveryZeZdroje("rozhovor", "https://loudwire.com/interview")).toBe("vysoka");
    expect(urovenDuveryZeZdroje("orientacni", "https://www.blabbermouth.net/news/x")).toBe("vysoka");
  });

  it("zdroj bez URL (booklet, ruční karta) se hodnotí podle kategorie jako dřív", () => {
    expect(urovenDuveryZeZdroje("oficialni_web", null)).toBe("vysoka");
    expect(urovenDuveryZeZdroje("archivni", null)).toBe("stredni");
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

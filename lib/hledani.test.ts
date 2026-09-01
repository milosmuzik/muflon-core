import { describe, expect, it } from "vitest";
import { normalizujProHledani, splnujeHledani } from "./hledani";

describe("normalizujProHledani", () => {
  it("slije AC/DC, ACDC i ac dc na stejný řetězec", () => {
    expect(normalizujProHledani("AC/DC")).toBe("acdc");
    expect(normalizujProHledani("ACDC")).toBe("acdc");
    expect(normalizujProHledani("ac dc")).toBe("acdc");
    expect(normalizujProHledani("Ac-Dc")).toBe("acdc");
  });

  it("odstraní diakritiku", () => {
    expect(normalizujProHledani("Mötley Crüe")).toBe("motleycrue");
  });
});

describe("splnujeHledani", () => {
  it("najde AC/DC podle ACDC i ac dc", () => {
    expect(splnujeHledani(["AC/DC"], "ACDC")).toBe(true);
    expect(splnujeHledani(["AC/DC"], "ac dc")).toBe(true);
    expect(splnujeHledani(["AC/DC"], "AC/DC")).toBe(true);
  });

  it("hledá i v alternativních názvech", () => {
    expect(splnujeHledani(["Led Zeppelin", "Zep"], "zep")).toBe(true);
  });

  it("nenajde nesouvisející název", () => {
    expect(splnujeHledani(["Metallica"], "ACDC")).toBe(false);
  });
});

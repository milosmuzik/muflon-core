import { describe, expect, it } from "vitest";
import { jsouDuplicitni } from "./duplicity";

describe("jsouDuplicitni", () => {
  it("pozná duplicitu i po přeformulování (skutečný případ - Korn)", () => {
    expect(
      jsouDuplicitni(
        "Vydání alba Follow the Leader od Korn",
        "Vydání přelomového alba Follow the Leader od Korn"
      )
    ).toBe(true);
  });

  it("nepovažuje dvě různé události za duplicitu, i když sdílí obecná slova", () => {
    expect(
      jsouDuplicitni("Vydání alba Follow the Leader od Korn", "Vydání alba Hysteria od Def Leppard")
    ).toBe(false);
  });

  it("prázdný název nikdy není duplicita", () => {
    expect(jsouDuplicitni("", "Vydání alba X")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { obsahujeFeat, rozdelFeat } from "./feat";

describe("rozdelFeat", () => {
  it("rozpozná ft. v názvu interpreta", () => {
    expect(rozdelFeat("Trivium Ft. Cristina Scabbia")).toEqual({
      primarni: "Trivium",
      hoste: ["Cristina Scabbia"],
    });
  });

  it("rozpozná feat. v závorce u skladby", () => {
    expect(rozdelFeat("In Waves (feat. Cristina Scabbia)")).toEqual({
      primarni: "In Waves",
      hoste: ["Cristina Scabbia"],
    });
  });

  it("rozseká víc hostů", () => {
    expect(rozdelFeat("Amon Amarth feat. Machine Head & Arch Enemy")).toEqual({
      primarni: "Amon Amarth",
      hoste: ["Machine Head", "Arch Enemy"],
    });
  });

  it("nesahá na běžné názvy", () => {
    expect(obsahujeFeat("After Forever")).toBe(false);
    expect(rozdelFeat("After Forever")).toBeNull();
    expect(rozdelFeat("Left Behind")).toBeNull();
  });
});

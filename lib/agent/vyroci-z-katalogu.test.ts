import { describe, expect, it } from "vitest";
import { parsujDatum } from "./vyroci-z-katalogu";

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

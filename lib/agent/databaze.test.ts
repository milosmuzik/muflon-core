import { describe, expect, it } from "vitest";
import { normalizuj, shodaNazvu } from "./databaze";

describe("shoda názvů databází", () => {
  it("ignoruje diakritiku a The", () => {
    expect(shodaNazvu("Slayer", "slayer")).toBe(true);
    expect(normalizuj("Mötley Crüe")).toBe("motley crue");
  });

  it("nerovná různé kapely", () => {
    expect(shodaNazvu("Slayer", "Death Slayer")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { jeGoogleRedirect } from "./redirect";

describe("jeGoogleRedirect", () => {
  it("pozná Google grounding redirect", () => {
    expect(jeGoogleRedirect("https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc")).toBe(true);
  });

  it("nepozná běžnou URL jako redirect", () => {
    expect(jeGoogleRedirect("https://www.loudwire.com/some-article")).toBe(false);
    expect(jeGoogleRedirect("https://en.wikipedia.org/wiki/X")).toBe(false);
  });

  it("nespadne na nerozebratelné URL", () => {
    expect(jeGoogleRedirect("neplatna-url")).toBe(false);
  });
});

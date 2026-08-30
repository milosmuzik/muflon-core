// lib/agent/redirect.ts
//
// Gemini google_search grounding vrací citace jako Google redirect
// (vertexaisearch.cloud.google.com/grounding-api-redirect/...), ne přímou
// URL zdroje. Bez rozbalení by whitelist domén (RENOMOVANE_ZDROJE_DOMENY)
// nikdy nenašel shodu - hostname by byl vždy Google, ne skutečné médium.

const GOOGLE_REDIRECT_HOST = "vertexaisearch.cloud.google.com";

export function jeGoogleRedirect(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === GOOGLE_REDIRECT_HOST;
  } catch {
    return false;
  }
}

export async function rozbalRedirect(url: string): Promise<string> {
  if (!url || !jeGoogleRedirect(url)) return url;
  try {
    let odpoved = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (!odpoved.url || odpoved.url === url) {
      odpoved = await fetch(url, { method: "GET", redirect: "follow" });
    }
    return odpoved.url || url;
  } catch {
    return url;
  }
}

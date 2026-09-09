const COOKIE = "muflon_auth";

export { COOKIE };

export async function podpis(tajemstvi: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(tajemstvi),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("muflon-core"));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function cookiePlatne(hodnota: string | undefined, heslo: string | undefined): Promise<boolean> {
  if (!heslo) return true;
  if (!hodnota) return false;
  return hodnota === (await podpis(heslo));
}

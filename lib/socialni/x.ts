// lib/socialni/x.ts
//
// Publikace na X (Twitter) přes API v2 (tweet) + v1.1 (upload obrázku),
// podepisováno OAuth 1.0a (uživatelský kontext, potřeba pro psaní příspěvků).

import crypto from "crypto";
import type { VysledekPublikace } from "./facebook";

const LIMIT_ZNAKU = 280;

type OAuthKlice = {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
};

function ockodovat(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function oauthHlavicka(method: string, url: string, klice: OAuthKlice): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: klice.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: klice.accessToken,
    oauth_version: "1.0",
  };

  const zakladniRetezec =
    method.toUpperCase() +
    "&" +
    ockodovat(url) +
    "&" +
    ockodovat(
      Object.keys(oauthParams)
        .sort()
        .map((k) => `${ockodovat(k)}=${ockodovat(oauthParams[k])}`)
        .join("&")
    );

  const klicPodpisu = `${ockodovat(klice.apiSecret)}&${ockodovat(klice.accessSecret)}`;
  const podpis = crypto.createHmac("sha1", klicPodpisu).update(zakladniRetezec).digest("base64");

  const hlavickaParams: Record<string, string> = { ...oauthParams, oauth_signature: podpis };
  return (
    "OAuth " +
    Object.keys(hlavickaParams)
      .sort()
      .map((k) => `${ockodovat(k)}="${ockodovat(hlavickaParams[k])}"`)
      .join(", ")
  );
}

function zkratit(text: string, max: number): string {
  if (text.length <= max) return text;
  const useknuty = text.slice(0, max - 1);
  const posledniMezera = useknuty.lastIndexOf(" ");
  return `${(posledniMezera > 0 ? useknuty.slice(0, posledniMezera) : useknuty).trim()}…`;
}

async function nahratMedia(obrazekUrl: string, klice: OAuthKlice): Promise<string | null> {
  const obrazek = await fetch(obrazekUrl);
  if (!obrazek.ok) return null;
  const buffer = await obrazek.arrayBuffer();

  const url = "https://upload.twitter.com/1.1/media/upload.json";
  const formData = new FormData();
  formData.append("media", new Blob([buffer], { type: "image/png" }), "obrazek.png");

  const odpoved = await fetch(url, {
    method: "POST",
    headers: { Authorization: oauthHlavicka("POST", url, klice) },
    body: formData,
  });
  const data = await odpoved.json();
  if (!odpoved.ok) return null;
  return data.media_id_string ?? null;
}

export async function publikujNaX(text: string, obrazekUrl?: string): Promise<VysledekPublikace> {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    return { uspech: false, chyba: "Chybí X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET v proměnných prostředí." };
  }
  const klice: OAuthKlice = { apiKey, apiSecret, accessToken, accessSecret };

  try {
    let mediaId: string | null = null;
    if (obrazekUrl) {
      mediaId = await nahratMedia(obrazekUrl, klice);
    }

    const url = "https://api.twitter.com/2/tweets";
    const telo: Record<string, unknown> = { text: zkratit(text, LIMIT_ZNAKU) };
    if (mediaId) telo.media = { media_ids: [mediaId] };

    const odpoved = await fetch(url, {
      method: "POST",
      headers: { Authorization: oauthHlavicka("POST", url, klice), "Content-Type": "application/json" },
      body: JSON.stringify(telo),
    });
    const data = await odpoved.json();
    if (!odpoved.ok) {
      return { uspech: false, chyba: JSON.stringify(data.errors ?? data.detail ?? data).slice(0, 400) };
    }
    return { uspech: true, externiId: data.data?.id };
  } catch (e) {
    return { uspech: false, chyba: (e as Error).message };
  }
}

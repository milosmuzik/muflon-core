import type { VysledekPublikace } from "./facebook";

export async function publikujNaInstagram(obrazekUrl: string, caption: string): Promise<VysledekPublikace> {
  const igId = process.env.INSTAGRAM_ACCOUNT_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!igId || !token) {
    return { uspech: false, chyba: "Chybí INSTAGRAM_ACCOUNT_ID nebo FACEBOOK_PAGE_ACCESS_TOKEN v proměnných prostředí." };
  }

  try {
    const vytvorOdpoved = await fetch(`https://graph.facebook.com/v21.0/${igId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: obrazekUrl, caption, access_token: token }),
    });
    const vytvorData = await vytvorOdpoved.json();
    if (!vytvorOdpoved.ok) {
      return { uspech: false, chyba: JSON.stringify(vytvorData.error ?? vytvorData).slice(0, 400) };
    }

    const publikujOdpoved = await fetch(`https://graph.facebook.com/v21.0/${igId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: vytvorData.id, access_token: token }),
    });
    const publikujData = await publikujOdpoved.json();
    if (!publikujOdpoved.ok) {
      return { uspech: false, chyba: JSON.stringify(publikujData.error ?? publikujData).slice(0, 400) };
    }

    return { uspech: true, externiId: publikujData.id };
  } catch (e) {
    return { uspech: false, chyba: (e as Error).message };
  }
}

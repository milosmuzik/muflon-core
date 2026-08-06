export type VysledekPublikace = {
  uspech: boolean;
  externiId?: string;
  chyba?: string;
};

export async function publikujNaFacebook(text: string, obrazekUrl?: string): Promise<VysledekPublikace> {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!pageId || !token) {
    return { uspech: false, chyba: "Chybí FACEBOOK_PAGE_ID nebo FACEBOOK_PAGE_ACCESS_TOKEN v proměnných prostředí." };
  }

  try {
    const endpoint = obrazekUrl
      ? `https://graph.facebook.com/v21.0/${pageId}/photos`
      : `https://graph.facebook.com/v21.0/${pageId}/feed`;
    const telo = obrazekUrl
      ? { url: obrazekUrl, caption: text, access_token: token }
      : { message: text, access_token: token };

    const odpoved = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(telo),
    });
    const data = await odpoved.json();

    if (!odpoved.ok) {
      return { uspech: false, chyba: JSON.stringify(data.error ?? data).slice(0, 400) };
    }
    return { uspech: true, externiId: data.id ?? data.post_id };
  } catch (e) {
    return { uspech: false, chyba: (e as Error).message };
  }
}

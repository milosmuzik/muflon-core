export type NalezenyZdroj = { nazev: string; url: string; kategorie: string };

const USER_AGENT = "MuflonCore/0.1 (https://muflon-core.vercel.app; redakce Rádia Muflon)";

function normalizuj(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function shodaNazvu(a: string, b: string): boolean {
  return normalizuj(a) === normalizuj(b);
}

function vytahniOdkazy(html: string): { text: string; url: string }[] {
  const vysledek: { text: string; url: string }[] = [];
  const re = /<a href="(https:\/\/www\.metal-archives\.com\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    vysledek.push({ url: m[1], text: m[2].trim() });
  }
  return vysledek;
}

async function maAjax(cesta: string): Promise<string[][]> {
  const url = `https://www.metal-archives.com${cesta}`;
  const odpoved = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!odpoved.ok) return [];
  const data = await odpoved.json();
  return Array.isArray(data?.aaData) ? data.aaData : [];
}

function jedinecnyPresny(
  radky: string[][],
  sloupecHtml: number,
  hledany: string
): { text: string; url: string } | null {
  const presne: { text: string; url: string }[] = [];
  for (const radek of radky) {
    const html = radek[sloupecHtml] ?? "";
    for (const odkaz of vytahniOdkazy(html)) {
      if (shodaNazvu(odkaz.text, hledany)) presne.push(odkaz);
    }
  }
  const unikat = new Map(presne.map((p) => [p.url, p]));
  if (unikat.size !== 1) return null;
  return [...unikat.values()][0];
}

export async function najdiKapeluNaMetalArchives(nazev: string): Promise<NalezenyZdroj | null> {
  const q = encodeURIComponent(nazev.slice(0, 80));
  const radky = await maAjax(
    `/search/ajax-band-search/?field=name&query=${q}&sEcho=1&iDisplayStart=0&iDisplayLength=10`
  );
  const hit = jedinecnyPresny(radky, 0, nazev);
  if (!hit) return null;
  return { nazev: "Encyclopaedia Metallum: The Metal Archives", url: hit.url, kategorie: "databaze" };
}

export async function najdiAlbaNaMetalArchives(
  nazevAlba: string,
  interpret?: string | null
): Promise<{ zdroj: NalezenyZdroj; datumVydani?: string } | null> {
  const q = encodeURIComponent(nazevAlba.slice(0, 80));
  const radky = await maAjax(
    `/search/ajax-album-search/?field=title&query=${q}&sEcho=1&iDisplayStart=0&iDisplayLength=10`
  );
  const kandidati = radky.filter((r) => {
    const album = vytahniOdkazy(r[1] ?? "")[0];
    if (!album || !shodaNazvu(album.text, nazevAlba)) return false;
    if (!interpret) return true;
    const kapela = vytahniOdkazy(r[0] ?? "")[0];
    return !kapela || shodaNazvu(kapela.text, interpret);
  });
  if (kandidati.length !== 1) return null;
  const album = vytahniOdkazy(kandidati[0][1] ?? "")[0];
  if (!album) return null;
  const datumHtml = kandidati[0][3] ?? "";
  const datum = datumHtml.match(/<!--\s*(\d{4}(?:-\d{2}(?:-\d{2})?)?)\s*-->/)?.[1];
  return {
    zdroj: { nazev: "Encyclopaedia Metallum: The Metal Archives", url: album.url, kategorie: "databaze" },
    datumVydani: datum,
  };
}

export async function najdiHudebnikaNaMetalArchives(
  jmeno: string,
  kapela?: string | null
): Promise<{ zdroj: NalezenyZdroj; datumNarozeni?: string } | null> {
  const q = encodeURIComponent(jmeno.slice(0, 80));
  const radky = await maAjax(
    `/search/ajax-artist-search/?field=alias&query=${q}&sEcho=1&iDisplayStart=0&iDisplayLength=10`
  );
  const kandidati = radky.filter((r) => {
    const umelec = vytahniOdkazy(r[0] ?? "")[0];
    if (!umelec) return false;
    const hlavni = (r[0] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!shodaNazvu(umelec.text, jmeno) && !hlavni.toLowerCase().includes(jmeno.toLowerCase())) {
      return false;
    }
    if (!kapela) return true;
    return (r[3] ?? "").toLowerCase().includes(kapela.toLowerCase());
  });
  if (kandidati.length !== 1) return null;
  const umelec = vytahniOdkazy(kandidati[0][0] ?? "")[0];
  if (!umelec) return null;
  return {
    zdroj: { nazev: "Encyclopaedia Metallum: The Metal Archives", url: umelec.url, kategorie: "databaze" },
  };
}

export async function faktaZMusicBrainzHudebnik(jmeno: string): Promise<{
  datumNarozeni?: string;
  datumUmrti?: string;
  zdroj?: NalezenyZdroj;
} | null> {
  const dotaz = encodeURIComponent(`artist:"${jmeno.replace(/"/g, "")}" AND type:person`);
  const odpoved = await fetch(`https://musicbrainz.org/ws/2/artist/?query=${dotaz}&fmt=json&limit=5`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!odpoved.ok) return null;
  const data = await odpoved.json();
  const hit = (data.artists ?? []).find(
    (a: { name: string; score?: number }) => shodaNazvu(a.name, jmeno) && (a.score ?? 0) >= 90
  );
  if (!hit) return null;
  const detail = await fetch(`https://musicbrainz.org/ws/2/artist/${hit.id}?fmt=json`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!detail.ok) {
    return {
      zdroj: { nazev: "MusicBrainz", url: `https://musicbrainz.org/artist/${hit.id}`, kategorie: "databaze" },
    };
  }
  const a = await detail.json();
  const span = a["life-span"] ?? {};
  return {
    datumNarozeni: span.begin || undefined,
    datumUmrti: span.ended ? span.end || undefined : undefined,
    zdroj: { nazev: "MusicBrainz", url: `https://musicbrainz.org/artist/${a.id}`, kategorie: "databaze" },
  };
}

export async function faktaZMusicBrainzAlbum(
  nazev: string,
  interpret?: string | null
): Promise<{ datumVydani?: string; vydavatel?: string; zdroj?: NalezenyZdroj } | null> {
  const casti = [`release:"${nazev.replace(/"/g, "")}"`];
  if (interpret) casti.push(`artist:"${interpret.replace(/"/g, "")}"`);
  const odpoved = await fetch(
    `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(casti.join(" AND "))}&fmt=json&limit=5`,
    { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } }
  );
  if (!odpoved.ok) return null;
  const data = await odpoved.json();
  const hit = (data.releases ?? []).find((r: { title: string; score?: number }) => shodaNazvu(r.title, nazev));
  if (!hit) return null;
  return {
    datumVydani: hit.date,
    vydavatel: hit["label-info"]?.[0]?.label?.name,
    zdroj: { nazev: "MusicBrainz", url: `https://musicbrainz.org/release/${hit.id}`, kategorie: "databaze" },
  };
}

export { shodaNazvu, normalizuj };

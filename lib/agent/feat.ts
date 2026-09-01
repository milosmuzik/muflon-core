const FEAT_ODDELOVAC = /\s+(?:feat(?:uring)?\.?|ft\.?)\s+/i;
const FEAT_V_ZAVORCE = /^(.*?)\s*[\(\[]\s*(?:feat(?:uring)?\.?|ft\.?)\s+(.+?)[\)\]]\s*$/i;
const HOST_ODDELOVAC = /\s*(?:,|;|&|\band\b|\ba\b)\s*/i;

export function obsahujeFeat(nazev: string): boolean {
  return FEAT_ODDELOVAC.test(nazev) || FEAT_V_ZAVORCE.test(nazev);
}

function rozdelHosty(surove: string): string[] {
  return surove
    .split(HOST_ODDELOVAC)
    .map((cast) => cast.replace(/^[\(\[]|[\)\]]$/g, "").trim())
    .filter((cast) => cast.length > 1);
}

export function rozdelFeat(nazev: string): { primarni: string; hoste: string[] } | null {
  const vZavorce = nazev.match(FEAT_V_ZAVORCE);
  if (vZavorce) {
    const primarni = vZavorce[1].trim();
    const hoste = rozdelHosty(vZavorce[2]);
    if (!primarni || hoste.length === 0) return null;
    return { primarni, hoste };
  }

  const casti = nazev.split(FEAT_ODDELOVAC).map((c) => c.trim()).filter(Boolean);
  if (casti.length < 2) return null;
  const primarni = casti[0];
  const hoste = rozdelHosty(casti.slice(1).join(", "));
  if (!primarni || hoste.length === 0) return null;
  return { primarni, hoste };
}

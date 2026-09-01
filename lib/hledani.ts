// Normalizace názvů pro vyhledávání: AC/DC, ACDC i „ac dc“ jsou stejné.
export function normalizujProHledani(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function splnujeHledani(pole: Array<string | null | undefined>, dotaz: string): boolean {
  const nDotaz = normalizujProHledani(dotaz);
  if (nDotaz.length < 1) return false;
  return pole.some((p) => p != null && normalizujProHledani(p).includes(nDotaz));
}

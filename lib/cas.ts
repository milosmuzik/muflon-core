const PASMO = "Europe/Prague";

export function tedVPraze(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: PASMO }));
}

/** MM-DD v Europe/Prague */
export function mmddPraha(d: Date = tedVPraze()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const den = String(d.getDate()).padStart(2, "0");
  return `${m}-${den}`;
}

/** YYYY-MM-DD v Europe/Prague */
export function isoPraha(d: Date = tedVPraze()): string {
  const y = d.getFullYear();
  return `${y}-${mmddPraha(d)}`;
}

export function zacatekRokuUtc(d: Date = tedVPraze()): Date {
  return new Date(Date.UTC(d.getFullYear(), 0, 1));
}

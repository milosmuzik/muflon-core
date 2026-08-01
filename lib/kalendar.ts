export type UdalostSDatem = {
  id: string;
  nazev: string;
  typ: string;
  datum: string; // YYYY-MM-DD nebo MM-DD
  opakujeSe: boolean;
  popis: string | null;
};

// Vrátí měsíc a den bez ohledu na to, zda je uloženo YYYY-MM-DD nebo jen MM-DD.
function mesicDen(datum: string): { mesic: number; den: number } | null {
  const cásti = datum.split("-");
  if (cásti.length === 3) return { mesic: Number(cásti[1]), den: Number(cásti[2]) };
  if (cásti.length === 2) return { mesic: Number(cásti[0]), den: Number(cásti[1]) };
  return null;
}

export function pocetDniDoNejblizsihoVyroci(datum: string, opakujeSe: boolean, dnes = new Date()): number | null {
  const md = mesicDen(datum);
  if (!md) return null;
  if (!opakujeSe) return null;

  const letos = new Date(dnes.getFullYear(), md.mesic - 1, md.den);
  const priste = new Date(dnes.getFullYear() + 1, md.mesic - 1, md.den);
  const cil = letos.getTime() >= new Date(dnes.getFullYear(), dnes.getMonth(), dnes.getDate()).getTime() ? letos : priste;

  const rozdilMs = cil.getTime() - new Date(dnes.getFullYear(), dnes.getMonth(), dnes.getDate()).getTime();
  return Math.round(rozdilMs / (1000 * 60 * 60 * 24));
}

export function serazenoPodleNejblizsiho(udalosti: UdalostSDatem[], dnes = new Date()) {
  return udalosti
    .map((u) => ({ u, dny: pocetDniDoNejblizsihoVyroci(u.datum, u.opakujeSe, dnes) }))
    .filter((x) => x.dny !== null)
    .sort((a, b) => (a.dny as number) - (b.dny as number));
}

export const NAZVY_MESICU = [
  "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
];

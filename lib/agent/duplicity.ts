import { prisma } from "@/lib/prisma";
import { zapisHistorii } from "@/lib/history";

// Slova, která se objevují ve spoustě názvů bez ohledu na téma - při
// porovnávání se ignorují, ať nezkreslují shodu.
const STOPWORDS = new Set([
  "vydani", "vydal", "vydala", "vydalo", "alba", "album", "kapela", "kapely", "kapelou",
  "od", "se", "je", "a", "na", "v", "ve", "do", "za", "pri", "po", "the", "of", "by", "in", "on",
]);

function tokeny(nazev: string): Set<string> {
  return new Set(
    nazev
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

// Dvě události na stejné datum jsou duplicita, pokud se jejich
// "podstatná" slova (bez stopslov) překrývají aspoň ze 40 % (Jaccard) -
// robustnější než starší kontrola prvních 20 znaků názvu, kterou stačilo
// přeformulovat a duplicita prošla.
export function jsouDuplicitni(a: string, b: string): boolean {
  const ta = tokeny(a);
  const tb = tokeny(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let prunik = 0;
  for (const t of ta) if (tb.has(t)) prunik++;
  const sjednoceni = ta.size + tb.size - prunik;
  return prunik / sjednoceni >= 0.4;
}

export type VysledekSlouceni = { skupinZkontrolovano: number; smazanoDuplicit: number };

// Jednorázový úklid: projde všechny existující události seskupené podle
// data a v každé skupině najde a smaže duplicity (viz jsouDuplicitni).
// Zachová tu "lepší" verzi - přednost má vyšší stav (schváleno/publikováno
// > ověřeno > návrh), pak víc zdrojů, pak starší záznam.
export async function slouciDuplicitniUdalosti(): Promise<VysledekSlouceni> {
  const vsechny = await prisma.udalost.findMany({ orderBy: { datum: "asc" } });
  const podleData = new Map<string, typeof vsechny>();
  for (const u of vsechny) {
    const skupina = podleData.get(u.datum) ?? [];
    skupina.push(u);
    podleData.set(u.datum, skupina);
  }

  let skupinZkontrolovano = 0;
  let smazanoDuplicit = 0;
  const vahaStavu = (s: string) => (s === "schvaleno" || s === "publikovano" ? 2 : s === "overeno" ? 1 : 0);

  for (const skupina of podleData.values()) {
    if (skupina.length < 2) continue;
    skupinZkontrolovano++;
    const smazane = new Set<string>();

    for (let i = 0; i < skupina.length; i++) {
      if (smazane.has(skupina[i].id)) continue;
      for (let j = i + 1; j < skupina.length; j++) {
        if (smazane.has(skupina[j].id)) continue;
        if (!jsouDuplicitni(skupina[i].nazev, skupina[j].nazev)) continue;

        const a = skupina[i];
        const b = skupina[j];
        const zdrojeA = await prisma.zdroj.count({ where: { cilovyTyp: "Udalost", cilovyId: a.id } });
        const zdrojeB = await prisma.zdroj.count({ where: { cilovyTyp: "Udalost", cilovyId: b.id } });

        let ponechat = a;
        let smazat = b;
        if (
          vahaStavu(b.stav) > vahaStavu(a.stav) ||
          (vahaStavu(b.stav) === vahaStavu(a.stav) && zdrojeB > zdrojeA) ||
          (vahaStavu(b.stav) === vahaStavu(a.stav) && zdrojeB === zdrojeA && b.createdAt < a.createdAt)
        ) {
          ponechat = b;
          smazat = a;
        }

        await prisma.zdroj.deleteMany({ where: { cilovyTyp: "Udalost", cilovyId: smazat.id } });
        await prisma.vazba.deleteMany({
          where: { OR: [{ zdrojovyTyp: "Udalost", zdrojovyId: smazat.id }, { cilovyTyp: "Udalost", cilovyId: smazat.id }] },
        });
        await prisma.historieZmeny.deleteMany({ where: { entitaTyp: "Udalost", entitaId: smazat.id } });
        await prisma.publikace.deleteMany({ where: { udalostId: smazat.id } });
        await prisma.udalost.delete({ where: { id: smazat.id } });
        await zapisHistorii("Udalost", ponechat.id, "upraveno", `Sloučena duplicita: „${smazat.nazev}" smazána`);

        smazane.add(smazat.id);
        smazanoDuplicit++;
      }
    }
  }

  return { skupinZkontrolovano, smazanoDuplicit };
}

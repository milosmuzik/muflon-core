import { pridatVazbu, smazatVazbu } from "@/lib/actions/spolecne";
import Link from "next/link";
import IndexCard from "./IndexCard";
import { TYPY_ENTIT } from "@/lib/constants";

const CESTA_PODLE_TYPU: Record<string, string> = {
  Interpret: "/interpreti",
  Hudebnik: "/hudebnici",
  Album: "/alba",
  Skladba: "/skladby",
  Pribeh: "/pribehy",
  Udalost: "/udalosti",
};

type VazbaZobrazena = {
  id: string;
  cilovyTyp: string;
  cilovyId: string;
  cilovyNazev: string;
  typVztahu: string;
  poznamka: string | null;
  smer?: "odchozi" | "prichozi";
};

export default function VazbySekce({
  zdrojovyTyp,
  zdrojovyId,
  cesta,
  vazby,
}: {
  zdrojovyTyp: string;
  zdrojovyId: string;
  cesta: string;
  vazby: VazbaZobrazena[];
}) {
  const akce = pridatVazbu.bind(null, zdrojovyTyp, zdrojovyId, cesta);

  return (
    <IndexCard label="Vazby · souvislosti">
      {vazby.length === 0 ? (
        <p className="text-muted text-sm mb-4">Zatím žádné doplňkové vazby na jiné objekty.</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {vazby.map((v) => (
            <li key={v.id} className="flex items-start justify-between gap-3 text-sm border-b border-line/60 pb-2">
              <div>
                <Link
                  href={`${CESTA_PODLE_TYPU[v.cilovyTyp] ?? "#"}/${v.cilovyId}`}
                  className="text-paper underline decoration-line hover:decoration-accent"
                >
                  {v.cilovyNazev}
                </Link>
                <span className="text-muted font-mono text-xs ml-2">
                  {v.smer === "prichozi" ? "← " : ""}
                  {TYPY_ENTIT[v.cilovyTyp] ?? v.cilovyTyp} · {v.typVztahu}
                </span>
                {v.poznamka && <div className="text-muted text-xs mt-0.5">{v.poznamka}</div>}
              </div>
              <form action={smazatVazbu.bind(null, v.id, cesta)}>
                <button className="text-muted hover:text-rust text-xs focus-ring" title="Odstranit vazbu">
                  odebrat
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={akce} className="grid grid-cols-2 gap-2 text-sm">
        <select
          name="cilovyTyp"
          defaultValue="Pribeh"
          className="bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring"
        >
          {Object.entries(TYPY_ENTIT)
            .filter(([klic]) => klic !== zdrojovyTyp)
            .map(([klic, label]) => (
              <option key={klic} value={klic}>
                {label}
              </option>
            ))}
        </select>
        <input
          name="cilovyNazev"
          placeholder="Název cílového objektu"
          required
          className="bg-ink border border-line rounded-sm px-2 py-1.5 text-paper placeholder:text-muted/70 focus-ring"
        />
        <input
          name="typVztahu"
          placeholder="Povaha vztahu (např. zmiňuje, inspirováno, souvisí s)"
          required
          className="col-span-2 bg-ink border border-line rounded-sm px-2 py-1.5 text-paper placeholder:text-muted/70 focus-ring"
        />
        <button className="col-span-2 bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring">
          Přidat vazbu
        </button>
      </form>
    </IndexCard>
  );
}

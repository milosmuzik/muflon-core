import { pridatZdroj, smazatZdroj } from "@/lib/actions/spolecne";
import { STAV_LABEL, KATEGORIE_ZDROJE, KATEGORIE_ZDROJE_LABEL, KATEGORIE_ZDROJE_PRIORITA } from "@/lib/constants";
import IndexCard from "./IndexCard";

type Zdroj = {
  id: string;
  nazev: string;
  url: string | null;
  kategorie: string;
  uroverDuvery: string;
  datumOvereni: string | null;
  poznamka: string | null;
};

export default function ZdrojeSekce({
  cilovyTyp,
  cilovyId,
  cesta,
  zdroje,
}: {
  cilovyTyp: string;
  cilovyId: string;
  cesta: string;
  zdroje: Zdroj[];
}) {
  const akce = pridatZdroj.bind(null, cilovyTyp, cilovyId, cesta);

  const serazene = [...zdroje].sort(
    (a, b) => (KATEGORIE_ZDROJE_PRIORITA[a.kategorie] ?? 99) - (KATEGORIE_ZDROJE_PRIORITA[b.kategorie] ?? 99)
  );

  return (
    <IndexCard label="Zdroje · ověřitelnost">
      {serazene.length === 0 ? (
        <p className="text-muted text-sm mb-4">
          Zatím bez zdroje. Bez zdroje je údaj jen tvrzením, ne ověřenou znalostí.
        </p>
      ) : (
        <ul className="space-y-2 mb-4">
          {serazene.map((z) => (
            <li
              key={z.id}
              className="flex items-start justify-between gap-3 text-sm border-b border-line/60 pb-2"
            >
              <div>
                <div className="text-paper">
                  {z.url ? (
                    <a href={z.url} target="_blank" className="underline decoration-line hover:decoration-accent">
                      {z.nazev}
                    </a>
                  ) : (
                    z.nazev
                  )}
                </div>
                <div className="text-muted font-mono text-xs mt-0.5">
                  <span className="text-accent">{KATEGORIE_ZDROJE_PRIORITA[z.kategorie] ?? "?"}.</span>{" "}
                  {KATEGORIE_ZDROJE_LABEL[z.kategorie] ?? z.kategorie}
                  {" · "}
                  {STAV_LABEL[z.uroverDuvery] ?? z.uroverDuvery}
                  {z.datumOvereni ? ` · ověřeno ${z.datumOvereni}` : ""}
                </div>
                {z.poznamka && <div className="text-muted text-xs mt-0.5">{z.poznamka}</div>}
              </div>
              <form action={smazatZdroj.bind(null, z.id, cesta)}>
                <button className="text-muted hover:text-rust text-xs focus-ring" title="Odstranit zdroj">
                  odebrat
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={akce} className="grid grid-cols-2 gap-2 text-sm">
        <input
          name="nazev"
          placeholder="Název zdroje (např. rozhovor pro Kerrang!, booklet alba…)"
          required
          className="col-span-2 bg-ink border border-line rounded-sm px-2 py-1.5 text-paper placeholder:text-muted/70 focus-ring"
        />
        <input
          name="url"
          placeholder="URL (nepovinné)"
          className="col-span-2 bg-ink border border-line rounded-sm px-2 py-1.5 text-paper placeholder:text-muted/70 focus-ring"
        />
        <select
          name="kategorie"
          defaultValue="databaze"
          className="col-span-2 bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring"
        >
          {KATEGORIE_ZDROJE.map((k) => (
            <option key={k.klic} value={k.klic}>
              {k.priorita}. {k.label}
            </option>
          ))}
        </select>
        <select
          name="uroverDuvery"
          defaultValue="stredni"
          className="bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring"
        >
          <option value="neoverene">Neověřené</option>
          <option value="nizka">Nízká důvěra</option>
          <option value="stredni">Střední důvěra</option>
          <option value="vysoka">Vysoká důvěra</option>
        </select>
        <button className="bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring">
          Přidat zdroj
        </button>
      </form>
    </IndexCard>
  );
}

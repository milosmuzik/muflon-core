import { prisma } from "@/lib/prisma";
import { vytvoritPribeh } from "@/lib/actions/pribehy";
import IndexCard from "@/components/IndexCard";
import StatusBadge from "@/components/StatusBadge";
import RevizePribehyTlacitko from "@/components/RevizePribehyTlacitko";
import Link from "next/link";

export default async function PribehyPage({ searchParams }: { searchParams: { stav?: string } }) {
  const filtrStav = searchParams.stav;
  const pribehy = await prisma.pribeh.findMany({
    where: filtrStav ? { stav: filtrStav } : undefined,
    orderBy: { updatedAt: "desc" },
  });

  const vazby = await prisma.vazba.findMany({
    where: { zdrojovyTyp: "Pribeh", zdrojovyId: { in: pribehy.map((p) => p.id) }, cilovyTyp: "Interpret" },
  });
  const interpretIds = [...new Set(vazby.map((v) => v.cilovyId))];
  const interpreti = await prisma.interpret.findMany({ where: { id: { in: interpretIds } } });
  const nazevInterpreta = new Map(interpreti.map((i) => [i.id, i.nazev]));
  const interpretPribehu = new Map<string, string>();
  for (const v of vazby) {
    if (!interpretPribehu.has(v.zdrojovyId)) {
      interpretPribehu.set(v.zdrojovyId, nazevInterpreta.get(v.cilovyId) ?? "?");
    }
  }

  const STAVY = ["navrh", "overeno", "schvaleno", "publikovano", "archivovano"];

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl text-paper">Příběhy</h1>
        <span className="tab-label">{pribehy.length} záznamů</span>
      </div>

      <IndexCard label="Revize existujících příběhů podle důvěry zdrojů">
        <p className="text-muted text-sm mb-3">
          Projede všechny čekající příběhy (návrh/ověřeno) a rovnou schválí ty, které mají zdroj se střední nebo
          vyšší důvěrou. Nové zdroje se stejnou důvěrou teď schvalují příběh i sám automaticky, hned jak je přidáš.
        </p>
        <RevizePribehyTlacitko />
      </IndexCard>

      <div className="flex flex-wrap gap-2 text-xs font-mono">
        <Link href="/pribehy" className={`px-2 py-1 rounded-sm border ${!filtrStav ? "border-accent text-accent" : "border-line text-muted"}`}>vše</Link>
        {STAVY.map((s) => (
          <Link key={s} href={`/pribehy?stav=${s}`} className={`px-2 py-1 rounded-sm border ${filtrStav === s ? "border-accent text-accent" : "border-line text-muted"}`}>
            {s}
          </Link>
        ))}
      </div>

      <div className="space-y-3">
        {pribehy.map((p) => (
          <Link key={p.id} href={`/pribehy/${p.id}`} className="index-card p-4 pl-6 flex items-start justify-between gap-4 hover:border-accent/50 transition-colors focus-ring block">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-display text-lg text-paper">{p.nadpis}</div>
                {interpretPribehu.has(p.id) ? (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded-sm border border-line text-muted">
                    {interpretPribehu.get(p.id)}
                  </span>
                ) : (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded-sm border border-rust/40 text-rust">
                    bez interpreta
                  </span>
                )}
              </div>
              <p className="text-muted text-sm mt-1 line-clamp-2">{p.obsah}</p>
            </div>
            <StatusBadge stav={p.stav} />
          </Link>
        ))}
        {pribehy.length === 0 && <p className="text-muted text-sm">Žádné příběhy v tomto filtru.</p>}
      </div>

      <IndexCard label="Napsat nový příběh">
        <form action={vytvoritPribeh} className="space-y-3 text-sm">
          <input name="nadpis" placeholder="Nadpis" required className="w-full bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <input name="interpret" placeholder="Interpret, ke kterému příběh patří (nepovinné)" className="w-full bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <textarea name="obsah" placeholder="Redakčně zpracovaný text příběhu…" required rows={5} className="w-full bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <button className="bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-2 hover:bg-accentDim/50 transition-colors focus-ring">
            Uložit jako návrh
          </button>
        </form>
      </IndexCard>
    </div>
  );
}

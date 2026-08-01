import { prisma } from "@/lib/prisma";
import { vytvoritHudebnika } from "@/lib/actions/hudebnici";
import IndexCard from "@/components/IndexCard";
import Link from "next/link";

export default async function HudebniciPage({ searchParams }: { searchParams: { q?: string } }) {
  const dotaz = searchParams.q?.trim();
  const hudebnici = await prisma.hudebnik.findMany({
    where: dotaz ? { jmeno: { contains: dotaz, mode: "insensitive" as const } } : undefined,
    orderBy: { jmeno: "asc" },
    include: { _count: { select: { clenstvi: true } }, clenstvi: { include: { interpret: true }, take: 3 } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl text-paper">Hudebníci</h1>
        <span className="tab-label">{hudebnici.length} záznamů</span>
      </div>

      <form className="flex gap-2">
        <input name="q" defaultValue={dotaz} placeholder="Hledat hudebníka…" className="bg-ink border border-line rounded-sm px-3 py-2 text-sm text-paper placeholder:text-muted/70 w-64 focus-ring" />
        <button className="text-sm text-muted hover:text-paper px-3 py-2 focus-ring">Hledat</button>
      </form>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {hudebnici.map((h) => (
          <Link key={h.id} href={`/hudebnici/${h.id}`} className="index-card p-4 pl-6 hover:border-accent/50 transition-colors focus-ring">
            <div className="font-display text-lg text-paper">{h.jmeno}</div>
            <div className="text-muted text-xs mt-2 font-mono">
              {h.clenstvi.map((c) => c.interpret.nazev).join(", ") || "bez vazby na interpreta"}
            </div>
          </Link>
        ))}
      </div>

      <IndexCard label="Založit nového hudebníka">
        <form action={vytvoritHudebnika} className="grid grid-cols-2 gap-3 text-sm">
          <input name="jmeno" placeholder="Jméno" required className="col-span-2 bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <input name="pseudonymy" placeholder="Pseudonymy (nepovinné)" className="col-span-2 bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <input name="datumNarozeni" placeholder="Datum narození" className="bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <input name="datumUmrti" placeholder="Datum úmrtí (je-li relevantní)" className="bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <textarea name="poznamka" placeholder="Poznámka" rows={2} className="col-span-2 bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <button className="col-span-2 bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-2 hover:bg-accentDim/50 transition-colors focus-ring">
            Založit hudebníka
          </button>
        </form>
      </IndexCard>
    </div>
  );
}

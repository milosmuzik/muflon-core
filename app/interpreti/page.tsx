import { prisma } from "@/lib/prisma";
import { vytvoritInterpreta } from "@/lib/actions/interpreti";
import IndexCard from "@/components/IndexCard";
import StatusBadge from "@/components/StatusBadge";
import Link from "next/link";

export default async function InterpretiPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const dotaz = searchParams.q?.trim();
  const interpreti = await prisma.interpret.findMany({
    where: dotaz ? { nazev: { contains: dotaz, mode: "insensitive" as const } } : undefined,
    orderBy: { nazev: "asc" },
    include: { _count: { select: { alba: true, skladby: true, clenstvi: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl text-paper">Interpreti</h1>
        <span className="tab-label">{interpreti.length} záznamů</span>
      </div>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={dotaz}
          placeholder="Hledat interpreta…"
          className="bg-ink border border-line rounded-sm px-3 py-2 text-sm text-paper placeholder:text-muted/70 w-64 focus-ring"
        />
        <button className="text-sm text-muted hover:text-paper px-3 py-2 focus-ring">Hledat</button>
      </form>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {interpreti.map((i) => (
          <Link key={i.id} href={`/interpreti/${i.id}`} className="index-card p-4 pl-6 hover:border-accent/50 transition-colors focus-ring">
            <div className="flex items-start justify-between gap-2">
              <div className="font-display text-lg text-paper">{i.nazev}</div>
              <StatusBadge stav={i.stav} />
            </div>
            <div className="tab-label mt-2">
              {i.typ} {i.rokVzniku ? `· od ${i.rokVzniku}` : ""}
            </div>
            <div className="text-muted text-xs mt-2 font-mono">
              {i._count.alba} alb · {i._count.skladby} skladeb · {i._count.clenstvi} členství
            </div>
          </Link>
        ))}
      </div>

      <IndexCard label="Založit nového interpreta">
        <form action={vytvoritInterpreta} className="grid grid-cols-2 gap-3 text-sm">
          <input
            name="nazev"
            placeholder="Název interpreta"
            required
            className="col-span-2 bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring"
          />
          <select name="typ" defaultValue="kapela" className="bg-ink border border-line rounded-sm px-3 py-2 text-paper focus-ring">
            <option value="kapela">Kapela</option>
            <option value="solo">Sólový umělec</option>
            <option value="projekt">Hudební projekt</option>
          </select>
          <input
            name="rokVzniku"
            type="number"
            placeholder="Rok vzniku"
            className="bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring"
          />
          <textarea
            name="poznamka"
            placeholder="Poznámka (nepovinné)"
            className="col-span-2 bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring"
            rows={2}
          />
          <button className="col-span-2 bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-2 hover:bg-accentDim/50 transition-colors focus-ring">
            Založit interpreta
          </button>
        </form>
      </IndexCard>
    </div>
  );
}

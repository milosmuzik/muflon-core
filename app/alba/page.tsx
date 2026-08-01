import { prisma } from "@/lib/prisma";
import { vytvoritAlbum } from "@/lib/actions/alba";
import IndexCard from "@/components/IndexCard";
import Link from "next/link";

export default async function AlbaPage({ searchParams }: { searchParams: { q?: string } }) {
  const dotaz = searchParams.q?.trim();
  const alba = await prisma.album.findMany({
    where: dotaz ? { nazev: { contains: dotaz, mode: "insensitive" } } : undefined,
    orderBy: { nazev: "asc" },
    include: { interpreti: { include: { interpret: true } }, _count: { select: { skladby: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl text-paper">Alba</h1>
        <span className="tab-label">{alba.length} záznamů</span>
      </div>

      <form className="flex gap-2">
        <input name="q" defaultValue={dotaz} placeholder="Hledat album…" className="bg-ink border border-line rounded-sm px-3 py-2 text-sm text-paper placeholder:text-muted/70 w-64 focus-ring" />
        <button className="text-sm text-muted hover:text-paper px-3 py-2 focus-ring">Hledat</button>
      </form>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {alba.map((a) => (
          <Link key={a.id} href={`/alba/${a.id}`} className="index-card p-4 pl-6 hover:border-accent/50 transition-colors focus-ring">
            <div className="font-display text-lg text-paper">{a.nazev}</div>
            <div className="tab-label mt-2">{a.interpreti.map((i) => i.interpret.nazev).join(", ") || "bez interpreta"}</div>
            <div className="text-muted text-xs mt-2 font-mono">
              {a.datumVydani ?? "datum neznámé"} · {a._count.skladby} skladeb
            </div>
          </Link>
        ))}
      </div>

      <IndexCard label="Založit nové album">
        <form action={vytvoritAlbum} className="grid grid-cols-2 gap-3 text-sm">
          <input name="nazev" placeholder="Název alba" required className="col-span-2 bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <input name="interpretNazev" placeholder="Interpret" className="col-span-2 bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <input name="datumVydani" placeholder="Datum vydání (rok / rok-měsíc / přesné)" className="bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <input name="vydavatel" placeholder="Vydavatel" className="bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <textarea name="poznamka" placeholder="Poznámka" rows={2} className="col-span-2 bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <button className="col-span-2 bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-2 hover:bg-accentDim/50 transition-colors focus-ring">
            Založit album
          </button>
        </form>
      </IndexCard>
    </div>
  );
}

import { prisma } from "@/lib/prisma";
import { vytvoritSkladbu } from "@/lib/actions/skladby";
import IndexCard from "@/components/IndexCard";
import Link from "next/link";

const NA_STRANKU = 60;

export default async function SkladbyPage({
  searchParams,
}: {
  searchParams: { q?: string; strana?: string };
}) {
  const dotaz = searchParams.q?.trim();
  const strana = Math.max(1, Number(searchParams.strana) || 1);

  const kde = dotaz ? { nazev: { contains: dotaz, mode: "insensitive" as const } } : undefined;

  const [skladby, celkem] = await Promise.all([
    prisma.skladba.findMany({
      where: kde,
      orderBy: { nazev: "asc" },
      include: { interpreti: { include: { interpret: true } }, album: true },
      skip: (strana - 1) * NA_STRANKU,
      take: NA_STRANKU,
    }),
    prisma.skladba.count({ where: kde }),
  ]);

  const pocetStranek = Math.max(1, Math.ceil(celkem / NA_STRANKU));

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl text-paper">Skladby</h1>
        <span className="tab-label">{celkem} záznamů</span>
      </div>

      <form className="flex gap-2">
        <input name="q" defaultValue={dotaz} placeholder="Hledat skladbu…" className="bg-ink border border-line rounded-sm px-3 py-2 text-sm text-paper placeholder:text-muted/70 w-64 focus-ring" />
        <button className="text-sm text-muted hover:text-paper px-3 py-2 focus-ring">Hledat</button>
      </form>

      <div className="index-card divide-y divide-line/60">
        {skladby.map((s) => (
          <Link key={s.id} href={`/skladby/${s.id}`} className="flex items-center justify-between gap-4 px-5 py-2.5 pl-8 hover:bg-raised transition-colors focus-ring">
            <div className="min-w-0">
              <span className="text-paper text-sm">{s.nazev}</span>
              {s.verze && <span className="text-muted text-xs font-mono ml-2">{s.verze}</span>}
            </div>
            <div className="tab-label shrink-0 truncate max-w-[40%]">
              {s.interpreti.map((i) => i.interpret.nazev).join(", ") || "—"}
            </div>
          </Link>
        ))}
        {skladby.length === 0 && <p className="text-muted text-sm px-5 py-4 pl-8">Nic nenalezeno.</p>}
      </div>

      {pocetStranek > 1 && (
        <div className="flex items-center gap-3 text-sm font-mono text-muted">
          {strana > 1 && (
            <Link href={`?q=${dotaz ?? ""}&strana=${strana - 1}`} className="hover:text-accent">← předchozí</Link>
          )}
          <span>strana {strana} / {pocetStranek}</span>
          {strana < pocetStranek && (
            <Link href={`?q=${dotaz ?? ""}&strana=${strana + 1}`} className="hover:text-accent">další →</Link>
          )}
        </div>
      )}

      <IndexCard label="Založit novou skladbu">
        <form action={vytvoritSkladbu} className="grid grid-cols-2 gap-3 text-sm">
          <input name="nazev" placeholder="Přesný název dle playlistu" required className="col-span-2 bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <input name="interpretNazev" placeholder="Interpret" className="bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <input name="albumNazev" placeholder="Album (nepovinné)" className="bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <input name="verze" placeholder="Verze (studiová, živá, remaster…)" className="bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <input name="datumPrvnihoVydani" placeholder="Datum prvního vydání" className="bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <label className="col-span-2 flex items-center gap-2 text-muted">
            <input type="checkbox" name="vPlaylistu" defaultChecked /> aktuálně v playlistu Rádia Muflon
          </label>
          <button className="col-span-2 bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-2 hover:bg-accentDim/50 transition-colors focus-ring">
            Založit skladbu
          </button>
        </form>
      </IndexCard>
    </div>
  );
}

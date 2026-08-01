import { prisma } from "@/lib/prisma";
import Link from "next/link";
import IndexCard from "@/components/IndexCard";
import StatusBadge from "@/components/StatusBadge";
import { NAZVY_MESICU } from "@/lib/kalendar";

function mesicZDatumu(datum: string): number {
  const casti = datum.split("-");
  if (casti.length === 3) return Number(casti[1]);
  if (casti.length === 2) return Number(casti[0]);
  return 0;
}
function denZDatumu(datum: string): number {
  const casti = datum.split("-");
  return Number(casti[casti.length - 1]);
}

export default async function KalendarPage({ searchParams }: { searchParams: { mesic?: string } }) {
  const dnesniMesic = new Date().getMonth() + 1;
  const vybranyMesic = Number(searchParams.mesic) || dnesniMesic;

  const vsechny = await prisma.udalost.findMany();
  const vMesici = vsechny
    .filter((u) => mesicZDatumu(u.datum) === vybranyMesic)
    .sort((a, b) => denZDatumu(a.datum) - denZDatumu(b.datum));

  return (
    <div className="space-y-6">
      <div>
        <p className="tab-label mb-2">Etapa 4 · Mufloní kalendář</p>
        <h1 className="font-display text-2xl text-paper">Kalendář výročí</h1>
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs font-mono">
        {NAZVY_MESICU.map((nazev, idx) => (
          <Link
            key={nazev}
            href={`/kalendar?mesic=${idx + 1}`}
            className={`px-2.5 py-1 rounded-sm border ${vybranyMesic === idx + 1 ? "border-accent text-accent" : "border-line text-muted hover:text-paper"}`}
          >
            {nazev}
          </Link>
        ))}
      </div>

      <IndexCard label={NAZVY_MESICU[vybranyMesic - 1]}>
        {vMesici.length === 0 ? (
          <p className="text-muted text-sm">V tomto měsíci nejsou evidované žádné výročí.</p>
        ) : (
          <ul className="space-y-2">
            {vMesici.map((u) => (
              <li key={u.id} className="flex items-center justify-between text-sm border-b border-line/60 pb-2">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-accent w-6 text-right">{denZDatumu(u.datum)}.</span>
                  <Link href={`/udalosti/${u.id}`} className="text-paper hover:text-accent">{u.nazev}</Link>
                </div>
                <StatusBadge stav={u.stav} />
              </li>
            ))}
          </ul>
        )}
      </IndexCard>
    </div>
  );
}

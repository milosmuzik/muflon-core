import { prisma } from "@/lib/prisma";
import IndexCard from "@/components/IndexCard";
import StatusBadge from "@/components/StatusBadge";
import Link from "next/link";
import { serazenoPodleNejblizsiho } from "@/lib/kalendar";

export default async function Dashboard() {
  const [
    pocetInterpretu,
    pocetHudebniku,
    pocetAlb,
    pocetSkladeb,
    pocetPribehu,
    pocetUdalosti,
    pribehyKOvereni,
    udalostiVsechny,
    entityBezZdroje,
  ] = await Promise.all([
    prisma.interpret.count(),
    prisma.hudebnik.count(),
    prisma.album.count(),
    prisma.skladba.count(),
    prisma.pribeh.count(),
    prisma.udalost.count(),
    prisma.pribeh.findMany({ where: { stav: "navrh" }, orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.udalost.findMany(),
    prisma.pribeh.findMany({ take: 200, orderBy: { createdAt: "desc" } }),
  ]);

  // Příběhy bez jediného zdroje - kap. 4.4 "Pokud zdroj chybí, systém na to upozorní."
  const zdrojePribehu = await prisma.zdroj.findMany({ where: { cilovyTyp: "Pribeh" } });
  const idsSeZdrojem = new Set(zdrojePribehu.map((z) => z.cilovyId));
  const pribehyBezZdroje = entityBezZdroje.filter((p) => !idsSeZdrojem.has(p.id)).slice(0, 6);

  const nejblizsiVyroci = serazenoPodleNejblizsiho(udalostiVsechny).slice(0, 6);

  const dlazdice = [
    { label: "Interpreti", pocet: pocetInterpretu, href: "/interpreti" },
    { label: "Hudebníci", pocet: pocetHudebniku, href: "/hudebnici" },
    { label: "Alba", pocet: pocetAlb, href: "/alba" },
    { label: "Skladby", pocet: pocetSkladeb, href: "/skladby" },
    { label: "Příběhy", pocet: pocetPribehu, href: "/pribehy" },
    { label: "Události", pocet: pocetUdalosti, href: "/udalosti" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="tab-label mb-2">Redakční přehled</p>
        <h1 className="font-display text-3xl text-paper">„Neuchováváme data. Uchováváme znalosti.“</h1>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {dlazdice.map((d) => (
          <Link key={d.href} href={d.href} className="index-card p-4 pl-6 hover:border-accent/50 transition-colors focus-ring">
            <div className="font-display text-2xl text-paper">{d.pocet}</div>
            <div className="tab-label mt-1">{d.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <IndexCard label="Blíží se výročí">
          {nejblizsiVyroci.length === 0 ? (
            <p className="text-muted text-sm">Zatím nejsou evidované žádné události s daty.</p>
          ) : (
            <ul className="space-y-2">
              {nejblizsiVyroci.map(({ u, dny }) => (
                <li key={u.id} className="flex items-center justify-between text-sm border-b border-line/60 pb-2">
                  <Link href={`/udalosti/${u.id}`} className="text-paper hover:text-accent">
                    {u.nazev}
                  </Link>
                  <span className="font-mono text-xs text-muted">
                    {dny === 0 ? "dnes" : dny === 1 ? "zítra" : `za ${dny} dní`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/kalendar" className="text-accent text-sm mt-3 inline-block hover:underline">
            Otevřít celý kalendář →
          </Link>
        </IndexCard>

        <IndexCard label="Čeká na ověření zdroje">
          {pribehyBezZdroje.length === 0 ? (
            <p className="text-muted text-sm">Žádné příběhy bez zdroje. Dobrá práce.</p>
          ) : (
            <ul className="space-y-2">
              {pribehyBezZdroje.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm border-b border-line/60 pb-2">
                  <Link href={`/pribehy/${p.id}`} className="text-paper hover:text-accent">
                    {p.nadpis}
                  </Link>
                  <StatusBadge stav={p.stav} />
                </li>
              ))}
            </ul>
          )}
        </IndexCard>
      </div>

      {pribehyKOvereni.length > 0 && (
        <IndexCard label="Nejnovější návrhy příběhů">
          <ul className="space-y-2">
            {pribehyKOvereni.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm border-b border-line/60 pb-2">
                <Link href={`/pribehy/${p.id}`} className="text-paper hover:text-accent">
                  {p.nadpis}
                </Link>
                <StatusBadge stav={p.stav} />
              </li>
            ))}
          </ul>
        </IndexCard>
      )}
    </div>
  );
}

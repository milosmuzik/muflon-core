import { prisma } from "@/lib/prisma";
import IndexCard from "@/components/IndexCard";
import Link from "next/link";

export default async function HledatPage({ searchParams }: { searchParams: { q?: string } }) {
  const dotaz = searchParams.q?.trim();

  let vysledky: { typ: string; href: string; nazev: string; podnazev?: string }[] = [];

  if (dotaz) {
    const [interpreti, hudebnici, alba, skladby, pribehy, udalosti] = await Promise.all([
      prisma.interpret.findMany({ where: { nazev: { contains: dotaz, mode: "insensitive" } }, take: 10 }),
      prisma.hudebnik.findMany({ where: { jmeno: { contains: dotaz, mode: "insensitive" } }, take: 10 }),
      prisma.album.findMany({ where: { nazev: { contains: dotaz, mode: "insensitive" } }, take: 10 }),
      prisma.skladba.findMany({ where: { nazev: { contains: dotaz, mode: "insensitive" } }, take: 10 }),
      prisma.pribeh.findMany({ where: { OR: [{ nadpis: { contains: dotaz, mode: "insensitive" } }, { obsah: { contains: dotaz, mode: "insensitive" } }] }, take: 10 }),
      prisma.udalost.findMany({ where: { nazev: { contains: dotaz, mode: "insensitive" } }, take: 10 }),
    ]);

    vysledky = [
      ...interpreti.map((i) => ({ typ: "Interpret", href: `/interpreti/${i.id}`, nazev: i.nazev })),
      ...hudebnici.map((h) => ({ typ: "Hudebník", href: `/hudebnici/${h.id}`, nazev: h.jmeno })),
      ...alba.map((a) => ({ typ: "Album", href: `/alba/${a.id}`, nazev: a.nazev })),
      ...skladby.map((s) => ({ typ: "Skladba", href: `/skladby/${s.id}`, nazev: s.nazev })),
      ...pribehy.map((p) => ({ typ: "Příběh", href: `/pribehy/${p.id}`, nazev: p.nadpis })),
      ...udalosti.map((u) => ({ typ: "Událost", href: `/udalosti/${u.id}`, nazev: u.nazev })),
    ];
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-paper">Hledat ve znalostní síti</h1>
      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={dotaz}
          placeholder="Interpret, hudebník, album, skladba, příběh, událost…"
          className="bg-ink border border-line rounded-sm px-3 py-2 text-sm text-paper placeholder:text-muted/70 w-full max-w-md focus-ring"
          autoFocus
        />
        <button className="text-sm text-muted hover:text-paper px-3 py-2 focus-ring">Hledat</button>
      </form>

      {dotaz && (
        <IndexCard label={`${vysledky.length} výsledků pro „${dotaz}“`}>
          {vysledky.length === 0 ? (
            <p className="text-muted text-sm">Nic nenalezeno.</p>
          ) : (
            <ul className="space-y-2">
              {vysledky.map((v, idx) => (
                <li key={idx} className="flex items-center justify-between text-sm border-b border-line/60 pb-2">
                  <Link href={v.href} className="text-paper hover:text-accent">{v.nazev}</Link>
                  <span className="tab-label">{v.typ}</span>
                </li>
              ))}
            </ul>
          )}
        </IndexCard>
      )}
    </div>
  );
}

import { prisma } from "@/lib/prisma";
import IndexCard from "@/components/IndexCard";
import Link from "next/link";
import { splnujeHledani } from "@/lib/hledani";

export const dynamic = "force-dynamic";

export default async function HledatPage({ searchParams }: { searchParams: { q?: string } }) {
  const dotaz = searchParams.q?.trim();

  let vysledky: { typ: string; href: string; nazev: string }[] = [];

  if (dotaz) {
    const [interpreti, hudebnici, alba, skladby, pribehy, udalosti] = await Promise.all([
      prisma.interpret.findMany({ select: { id: true, nazev: true, alternativniNazvy: true } }),
      prisma.hudebnik.findMany({ select: { id: true, jmeno: true, pseudonymy: true } }),
      prisma.album.findMany({ select: { id: true, nazev: true, alternativniNazvy: true } }),
      prisma.skladba.findMany({ select: { id: true, nazev: true } }),
      prisma.pribeh.findMany({ select: { id: true, nadpis: true, obsah: true } }),
      prisma.udalost.findMany({ select: { id: true, nazev: true } }),
    ]);

    vysledky = [
      ...interpreti
        .filter((i) => splnujeHledani([i.nazev, i.alternativniNazvy], dotaz))
        .slice(0, 20)
        .map((i) => ({ typ: "Interpret", href: `/interpreti/${i.id}`, nazev: i.nazev })),
      ...hudebnici
        .filter((h) => splnujeHledani([h.jmeno, h.pseudonymy], dotaz))
        .slice(0, 20)
        .map((h) => ({ typ: "Hudebník", href: `/hudebnici/${h.id}`, nazev: h.jmeno })),
      ...alba
        .filter((a) => splnujeHledani([a.nazev, a.alternativniNazvy], dotaz))
        .slice(0, 20)
        .map((a) => ({ typ: "Album", href: `/alba/${a.id}`, nazev: a.nazev })),
      ...skladby
        .filter((s) => splnujeHledani([s.nazev], dotaz))
        .slice(0, 20)
        .map((s) => ({ typ: "Skladba", href: `/skladby/${s.id}`, nazev: s.nazev })),
      ...pribehy
        .filter((p) => splnujeHledani([p.nadpis, p.obsah], dotaz))
        .slice(0, 20)
        .map((p) => ({ typ: "Příběh", href: `/pribehy/${p.id}`, nazev: p.nadpis })),
      ...udalosti
        .filter((u) => splnujeHledani([u.nazev], dotaz))
        .slice(0, 20)
        .map((u) => ({ typ: "Událost", href: `/udalosti/${u.id}`, nazev: u.nazev })),
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

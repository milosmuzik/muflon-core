import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import IndexCard from "@/components/IndexCard";
import ZdrojeSekce from "@/components/ZdrojeSekce";
import VazbySekce from "@/components/VazbySekce";
import HistorieSekce from "@/components/HistorieSekce";
import DoplnitZaznamTlacitko from "@/components/DoplnitZaznamTlacitko";
import { upravitHudebnika } from "@/lib/actions/hudebnici";
import { najdiVazby } from "@/lib/actions/spolecne";

export default async function HudebnikDetail({ params }: { params: { id: string } }) {
  const hudebnik = await prisma.hudebnik.findUnique({
    where: { id: params.id },
    include: { clenstvi: { include: { interpret: true }, orderBy: { obdobiOd: "asc" } } },
  });
  if (!hudebnik) notFound();

  const cesta = `/hudebnici/${hudebnik.id}`;
  const [zdroje, vazby, historie] = await Promise.all([
    prisma.zdroj.findMany({ where: { cilovyTyp: "Hudebnik", cilovyId: hudebnik.id }, orderBy: { createdAt: "desc" } }),
    najdiVazby("Hudebnik", hudebnik.id),
    prisma.historieZmeny.findMany({ where: { entitaTyp: "Hudebnik", entitaId: hudebnik.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="tab-label mb-2">
          <Link href="/hudebnici" className="hover:text-accent">Hudebníci</Link> / {hudebnik.jmeno}
        </p>
        <h1 className="font-display text-3xl text-paper">{hudebnik.jmeno}</h1>
        {hudebnik.pseudonymy && <p className="text-muted text-sm mt-1">také jako: {hudebnik.pseudonymy}</p>}
        <p className="text-muted text-xs font-mono mt-1">
          {[hudebnik.datumNarozeni, hudebnik.datumUmrti].filter(Boolean).join(" – ")}
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <IndexCard label="Kariéra · členství v kapelách">
            {hudebnik.clenstvi.length === 0 ? (
              <p className="text-muted text-sm">Zatím žádná evidovaná členství. Přidej je na stránce interpreta.</p>
            ) : (
              <ul className="space-y-2">
                {hudebnik.clenstvi.map((c) => (
                  <li key={c.id} className="text-sm border-b border-line/60 pb-2">
                    <Link href={`/interpreti/${c.interpretId}`} className="text-paper hover:text-accent">
                      {c.interpret.nazev}
                    </Link>
                    <span className="text-muted text-xs font-mono ml-2">
                      {[c.role, c.nastroj, [c.obdobiOd, c.obdobiDo].filter(Boolean).join("–")].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </IndexCard>

          <VazbySekce zdrojovyTyp="Hudebnik" zdrojovyId={hudebnik.id} cesta={cesta} vazby={vazby} />
          <ZdrojeSekce cilovyTyp="Hudebnik" cilovyId={hudebnik.id} cesta={cesta} zdroje={zdroje} />
        </div>

        <div className="space-y-5">
          <IndexCard label="Najít další data">
            <p className="text-muted text-xs mb-3">Doplní prázdná pole a zdroje. Záznam nesmaže.</p>
            <DoplnitZaznamTlacitko typ="Hudebnik" id={hudebnik.id} />
          </IndexCard>
          <IndexCard label="Upravit záznam">
            <form action={upravitHudebnika.bind(null, hudebnik.id)} className="space-y-2 text-sm">
              <input name="jmeno" defaultValue={hudebnik.jmeno} className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <input name="pseudonymy" defaultValue={hudebnik.pseudonymy ?? ""} placeholder="Pseudonymy" className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <input name="datumNarozeni" defaultValue={hudebnik.datumNarozeni ?? ""} placeholder="Datum narození" className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <input name="datumUmrti" defaultValue={hudebnik.datumUmrti ?? ""} placeholder="Datum úmrtí" className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <textarea name="poznamka" defaultValue={hudebnik.poznamka ?? ""} rows={3} placeholder="Poznámka" className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <button className="w-full bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring">
                Uložit změny
              </button>
            </form>
          </IndexCard>
          <HistorieSekce zaznamy={historie} />
        </div>
      </div>
    </div>
  );
}

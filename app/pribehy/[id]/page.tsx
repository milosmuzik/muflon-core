import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import IndexCard from "@/components/IndexCard";
import StatusBadge from "@/components/StatusBadge";
import ZdrojeSekce from "@/components/ZdrojeSekce";
import VazbySekce from "@/components/VazbySekce";
import HistorieSekce from "@/components/HistorieSekce";
import { upravitPribeh } from "@/lib/actions/pribehy";
import { nazevObjektu, posunoutStav } from "@/lib/actions/spolecne";
import { DALSI_STAV, STAV_LABEL } from "@/lib/constants";

export default async function PribehDetail({ params }: { params: { id: string } }) {
  const pribeh = await prisma.pribeh.findUnique({ where: { id: params.id } });
  if (!pribeh) notFound();

  const cesta = `/pribehy/${pribeh.id}`;
  const [zdroje, vazbyRaw, historie] = await Promise.all([
    prisma.zdroj.findMany({ where: { cilovyTyp: "Pribeh", cilovyId: pribeh.id }, orderBy: { createdAt: "desc" } }),
    prisma.vazba.findMany({ where: { zdrojovyTyp: "Pribeh", zdrojovyId: pribeh.id }, orderBy: { createdAt: "desc" } }),
    prisma.historieZmeny.findMany({ where: { entitaTyp: "Pribeh", entitaId: pribeh.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const vazby = await Promise.all(vazbyRaw.map(async (v) => ({ ...v, cilovyNazev: await nazevObjektu(v.cilovyTyp, v.cilovyId) })));

  const dalsiStav = DALSI_STAV[pribeh.stav];
  const bezZdroje = zdroje.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="tab-label mb-2">
          <Link href="/pribehy" className="hover:text-accent">Příběhy</Link> / {pribeh.nadpis}
        </p>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl text-paper">{pribeh.nadpis}</h1>
          <StatusBadge stav={pribeh.stav} />
        </div>
      </div>

      {bezZdroje && (
        <div className="border border-rust/40 bg-rust/10 text-rust text-sm rounded-sm px-4 py-2">
          Tento příběh zatím nemá žádný zdroj. Lepší je označit údaj jako neověřený, než ho prezentovat jako fakt.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <IndexCard>
            <p className="text-paper whitespace-pre-wrap leading-relaxed">{pribeh.obsah}</p>
          </IndexCard>

          <VazbySekce zdrojovyTyp="Pribeh" zdrojovyId={pribeh.id} cesta={cesta} vazby={vazby} />
          <ZdrojeSekce cilovyTyp="Pribeh" cilovyId={pribeh.id} cesta={cesta} zdroje={zdroje} />
        </div>

        <div className="space-y-5">
          <IndexCard label="Redakční workflow">
            <p className="text-muted text-sm mb-3">Aktuální stav: <StatusBadge stav={pribeh.stav} /></p>
            {dalsiStav ? (
              bezZdroje ? (
                <p className="text-rust text-xs">
                  Nejdřív přidej aspoň jeden zdroj – bez něj stav nejde posunout dál.
                </p>
              ) : (
                <form action={posunoutStav.bind(null, "pribeh", pribeh.id, pribeh.stav, cesta)}>
                  <button className="w-full bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring text-sm">
                    Posunout na „{STAV_LABEL[dalsiStav]}“
                  </button>
                </form>
              )
            ) : (
              <p className="text-muted text-xs">Konečný stav dosažen.</p>
            )}
            <p className="text-muted text-xs mt-3">Konečné rozhodnutí o zveřejnění vždy zůstává na redaktorovi.</p>
          </IndexCard>

          <IndexCard label="Upravit text">
            <form action={upravitPribeh.bind(null, pribeh.id)} className="space-y-2 text-sm">
              <input name="nadpis" defaultValue={pribeh.nadpis} className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <textarea name="obsah" defaultValue={pribeh.obsah} rows={6} className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
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

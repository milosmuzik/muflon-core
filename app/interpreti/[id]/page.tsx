import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import IndexCard from "@/components/IndexCard";
import StatusBadge from "@/components/StatusBadge";
import ZdrojeSekce from "@/components/ZdrojeSekce";
import VazbySekce from "@/components/VazbySekce";
import HistorieSekce from "@/components/HistorieSekce";
import { upravitInterpreta, pridatClenstvi } from "@/lib/actions/interpreti";
import { nazevObjektu } from "@/lib/actions/spolecne";

export default async function InterpretDetail({ params }: { params: { id: string } }) {
  const interpret = await prisma.interpret.findUnique({
    where: { id: params.id },
    include: {
      clenstvi: { include: { hudebnik: true } },
      alba: { include: { album: true } },
      skladby: { include: { skladba: true } },
    },
  });
  if (!interpret) notFound();

  const cesta = `/interpreti/${interpret.id}`;

  const [zdroje, vazbyRaw, historie] = await Promise.all([
    prisma.zdroj.findMany({ where: { cilovyTyp: "Interpret", cilovyId: interpret.id }, orderBy: { createdAt: "desc" } }),
    prisma.vazba.findMany({ where: { zdrojovyTyp: "Interpret", zdrojovyId: interpret.id }, orderBy: { createdAt: "desc" } }),
    prisma.historieZmeny.findMany({ where: { entitaTyp: "Interpret", entitaId: interpret.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const vazby = await Promise.all(
    vazbyRaw.map(async (v) => ({ ...v, cilovyNazev: await nazevObjektu(v.cilovyTyp, v.cilovyId) }))
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="tab-label mb-2">
          <Link href="/interpreti" className="hover:text-accent">Interpreti</Link> / {interpret.nazev}
        </p>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl text-paper">{interpret.nazev}</h1>
          <StatusBadge stav={interpret.stav} />
        </div>
        <p className="text-muted text-sm mt-1">
          {interpret.typ} {interpret.rokVzniku ? `· od ${interpret.rokVzniku}` : ""}
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <IndexCard label="Hudebníci · členství">
            {interpret.clenstvi.length === 0 ? (
              <p className="text-muted text-sm mb-4">Zatím nejsou evidovaní žádní hudebníci.</p>
            ) : (
              <ul className="space-y-2 mb-4">
                {interpret.clenstvi.map((c) => (
                  <li key={c.id} className="text-sm border-b border-line/60 pb-2">
                    <Link href={`/hudebnici/${c.hudebnikId}`} className="text-paper hover:text-accent">
                      {c.hudebnik.jmeno}
                    </Link>
                    <span className="text-muted text-xs font-mono ml-2">
                      {[c.role, c.nastroj, [c.obdobiOd, c.obdobiDo].filter(Boolean).join("–")]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <form action={pridatClenstvi.bind(null, interpret.id)} className="grid grid-cols-2 gap-2 text-sm">
              <input name="hudebnikJmeno" placeholder="Jméno hudebníka" required className="col-span-2 bg-ink border border-line rounded-sm px-2 py-1.5 text-paper placeholder:text-muted/70 focus-ring" />
              <input name="role" placeholder="Role (např. zakládající člen)" className="bg-ink border border-line rounded-sm px-2 py-1.5 text-paper placeholder:text-muted/70 focus-ring" />
              <input name="nastroj" placeholder="Nástroj" className="bg-ink border border-line rounded-sm px-2 py-1.5 text-paper placeholder:text-muted/70 focus-ring" />
              <input name="obdobiOd" placeholder="Období od" className="bg-ink border border-line rounded-sm px-2 py-1.5 text-paper placeholder:text-muted/70 focus-ring" />
              <input name="obdobiDo" placeholder="Období do" className="bg-ink border border-line rounded-sm px-2 py-1.5 text-paper placeholder:text-muted/70 focus-ring" />
              <button className="col-span-2 bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring">
                Přidat členství
              </button>
            </form>
          </IndexCard>

          <IndexCard label={`Alba (${interpret.alba.length})`}>
            {interpret.alba.length === 0 ? (
              <p className="text-muted text-sm">Žádná alba.</p>
            ) : (
              <ul className="grid sm:grid-cols-2 gap-2">
                {interpret.alba.map((a) => (
                  <li key={a.id}>
                    <Link href={`/alba/${a.album.id}`} className="text-sm text-paper hover:text-accent">
                      {a.album.nazev}
                    </Link>
                    {a.album.datumVydani && <span className="text-muted text-xs font-mono ml-2">{a.album.datumVydani}</span>}
                  </li>
                ))}
              </ul>
            )}
          </IndexCard>

          <IndexCard label={`Skladby v playlistu (${interpret.skladby.length})`}>
            {interpret.skladby.length === 0 ? (
              <p className="text-muted text-sm">Žádné skladby.</p>
            ) : (
              <ul className="grid sm:grid-cols-2 gap-1.5">
                {interpret.skladby.map((s) => (
                  <li key={s.id}>
                    <Link href={`/skladby/${s.skladba.id}`} className="text-sm text-paper hover:text-accent">
                      {s.skladba.nazev}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </IndexCard>

          <VazbySekce zdrojovyTyp="Interpret" zdrojovyId={interpret.id} cesta={cesta} vazby={vazby} />
          <ZdrojeSekce cilovyTyp="Interpret" cilovyId={interpret.id} cesta={cesta} zdroje={zdroje} />
        </div>

        <div className="space-y-5">
          <IndexCard label="Upravit záznam">
            <form action={upravitInterpreta.bind(null, interpret.id)} className="space-y-2 text-sm">
              <input name="nazev" defaultValue={interpret.nazev} className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <select name="typ" defaultValue={interpret.typ} className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring">
                <option value="kapela">Kapela</option>
                <option value="solo">Sólový umělec</option>
                <option value="projekt">Hudební projekt</option>
              </select>
              <input name="rokVzniku" type="number" defaultValue={interpret.rokVzniku ?? ""} placeholder="Rok vzniku" className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <select name="stav" defaultValue={interpret.stav} className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring">
                <option value="aktivni">Aktivní</option>
                <option value="ukonceny">Ukončený</option>
                <option value="archivovany">Archivovaný</option>
              </select>
              <textarea name="poznamka" defaultValue={interpret.poznamka ?? ""} rows={3} placeholder="Poznámka" className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
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

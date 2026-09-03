import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import IndexCard from "@/components/IndexCard";
import StatusBadge from "@/components/StatusBadge";
import ZdrojeSekce from "@/components/ZdrojeSekce";
import VazbySekce from "@/components/VazbySekce";
import HistorieSekce from "@/components/HistorieSekce";
import OpravitVanaheimTlacitko from "@/components/OpravitVanaheimTlacitko";
import SmazatKartuTlacitko from "@/components/SmazatKartuTlacitko";
import SmazatClenstviTlacitko from "@/components/SmazatClenstviTlacitko";
import { upravitInterpreta, pridatClenstvi } from "@/lib/actions/interpreti";
import { najdiVazby } from "@/lib/actions/spolecne";
import { jeCiziVanaheimText, jeVanaheim } from "@/lib/homonyma/vanaheim";

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
  const vanaheimCizi =
    jeVanaheim(interpret.nazev) &&
    (jeCiziVanaheimText(`${interpret.zeme ?? ""} ${interpret.mesto ?? ""} ${interpret.historie ?? ""}`) ||
      interpret.clenstvi.some((c) => jeCiziVanaheimText(c.hudebnik.jmeno)));

  const [zdroje, vazby, historie, pribehyVazby, udalosti] = await Promise.all([
    prisma.zdroj.findMany({ where: { cilovyTyp: "Interpret", cilovyId: interpret.id }, orderBy: { createdAt: "desc" } }),
    najdiVazby("Interpret", interpret.id),
    prisma.historieZmeny.findMany({ where: { entitaTyp: "Interpret", entitaId: interpret.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.vazba.findMany({ where: { zdrojovyTyp: "Pribeh", cilovyTyp: "Interpret", cilovyId: interpret.id } }),
    prisma.udalost.findMany({ where: { nazev: { contains: interpret.nazev, mode: "insensitive" } }, orderBy: { datum: "asc" } }),
  ]);
  const pribehy = await prisma.pribeh.findMany({ where: { id: { in: pribehyVazby.map((v) => v.zdrojovyId) } }, orderBy: { updatedAt: "desc" } });

  return (
    <div className="space-y-6">
      <div>
        <p className="tab-label mb-2">
          <Link href="/interpreti" className="hover:text-accent">Interpreti</Link> / {interpret.nazev}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display text-3xl text-paper">{interpret.nazev}</h1>
          <StatusBadge stav={interpret.stav} />
          {interpret.urovenKarty === "referencni" && (
            <span className="text-xs font-mono px-2 py-0.5 rounded-sm border border-accent/40 text-accent">
              ⭐ Referenční karta
            </span>
          )}
          {interpret.referencniId && (
            <span className="text-xs font-mono text-muted">{interpret.referencniId}</span>
          )}
        </div>
        <p className="text-muted text-sm mt-1">
          {interpret.typ} {interpret.rokVzniku ? `· od ${interpret.rokVzniku}` : ""}
          {interpret.mesto && ` · ${interpret.mesto}`}
          {interpret.zeme && `, ${interpret.zeme}`}
        </p>
        {interpret.zanry && <p className="text-muted text-xs font-mono mt-1">{interpret.zanry}</p>}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {interpret.historie && (
            <IndexCard label="Historie">
              <p className="text-paper whitespace-pre-wrap leading-relaxed text-sm">{interpret.historie}</p>
            </IndexCard>
          )}
          <IndexCard label="Hudebníci · členství">
            {interpret.clenstvi.length === 0 ? (
              <p className="text-muted text-sm mb-4">Zatím nejsou evidovaní žádní hudebníci.</p>
            ) : (
              <ul className="space-y-2 mb-4">
                {interpret.clenstvi.map((c) => (
                  <li key={c.id} className="text-sm border-b border-line/60 pb-2 flex items-start justify-between gap-2">
                    <div>
                      <Link href={`/hudebnici/${c.hudebnikId}`} className="text-paper hover:text-accent">
                        {c.hudebnik.jmeno}
                      </Link>
                      <span className="text-muted text-xs font-mono ml-2">
                        {[c.role, c.nastroj, [c.obdobiOd, c.obdobiDo].filter(Boolean).join("–")]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    <SmazatClenstviTlacitko clenstviId={c.id} interpretId={interpret.id} />
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

          {pribehy.length > 0 && (
            <IndexCard label={`Příběhy (${pribehy.length})`}>
              <ul className="space-y-2">
                {pribehy.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-sm border-b border-line/60 pb-2 last:border-0">
                    <Link href={`/pribehy/${p.id}`} className="text-paper hover:text-accent">{p.nadpis}</Link>
                    <StatusBadge stav={p.stav} />
                  </li>
                ))}
              </ul>
            </IndexCard>
          )}

          {udalosti.length > 0 && (
            <IndexCard label={`Události (${udalosti.length})`}>
              <ul className="space-y-2">
                {udalosti.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 text-sm border-b border-line/60 pb-2 last:border-0">
                    <Link href={`/udalosti/${u.id}`} className="text-paper hover:text-accent">
                      {u.nazev} <span className="text-muted font-mono text-xs">· {u.datum}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </IndexCard>
          )}

          <VazbySekce zdrojovyTyp="Interpret" zdrojovyId={interpret.id} cesta={cesta} vazby={vazby} />
          <ZdrojeSekce cilovyTyp="Interpret" cilovyId={interpret.id} cesta={cesta} zdroje={zdroje} />
        </div>

        <div className="space-y-5">
          {vanaheimCizi && (
            <IndexCard label="Homonymum">
              <p className="text-sm text-paper mb-3 leading-relaxed">
                Na této kartě je nizozemský Vanaheim z Tilburgu. V Muflonu má být česká kapela z Chlumce nad Cidlinou.
              </p>
              <OpravitVanaheimTlacitko interpretId={interpret.id} />
            </IndexCard>
          )}
          {interpret.redakcniVyznam && (
            <IndexCard label="Redakční význam">
              <p className="text-muted text-sm leading-relaxed">{interpret.redakcniVyznam}</p>
            </IndexCard>
          )}
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
              <div className="grid grid-cols-2 gap-2">
                <input name="mesto" defaultValue={interpret.mesto ?? ""} placeholder="Město vzniku" className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
                <input name="zeme" defaultValue={interpret.zeme ?? ""} placeholder="Země" className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              </div>
              <input name="zanry" defaultValue={interpret.zanry ?? ""} placeholder="Žánry (čárkou oddělené)" className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <textarea name="historie" defaultValue={interpret.historie ?? ""} rows={4} placeholder="Historie / charakteristika (redakčně zpracovaný text)" className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <textarea name="redakcniVyznam" defaultValue={interpret.redakcniVyznam ?? ""} rows={3} placeholder="Redakční význam (interní poznámka)" className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <input name="referencniId" defaultValue={interpret.referencniId ?? ""} placeholder="Referenční ID (např. CZ-KABAT-1983-001)" className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring font-mono text-xs" />
              <select name="urovenKarty" defaultValue={interpret.urovenKarty} className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring">
                <option value="navrh">Návrh</option>
                <option value="referencni">⭐ Referenční karta</option>
              </select>
              <textarea name="poznamka" defaultValue={interpret.poznamka ?? ""} rows={3} placeholder="Poznámka" className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <button className="w-full bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring">
                Uložit změny
              </button>
            </form>
            <div className="mt-3">
              <SmazatKartuTlacitko interpretId={interpret.id} nazev={interpret.nazev} />
            </div>
          </IndexCard>

          <HistorieSekce zaznamy={historie} />
        </div>
      </div>
    </div>
  );
}

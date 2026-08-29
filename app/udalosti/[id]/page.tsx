import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import IndexCard from "@/components/IndexCard";
import StatusBadge from "@/components/StatusBadge";
import ZdrojeSekce from "@/components/ZdrojeSekce";
import VazbySekce from "@/components/VazbySekce";
import HistorieSekce from "@/components/HistorieSekce";
import { upravitUdalost, rozsiritUdalost } from "@/lib/actions/udalosti";
import { nazevObjektu, posunoutStav } from "@/lib/actions/spolecne";
import { prepnoutZverejneni } from "@/lib/actions/agent";
import { nahratFotkuUdalosti } from "@/lib/actions/upload";
import { publikovatNaFacebook, publikovatNaInstagram } from "@/lib/actions/socialni";
import { DALSI_STAV, STAV_LABEL } from "@/lib/constants";

export default async function UdalostDetail({ params }: { params: { id: string } }) {
  const udalost = await prisma.udalost.findUnique({ where: { id: params.id } });
  if (!udalost) notFound();

  const cesta = `/udalosti/${udalost.id}`;
  const [zdroje, vazbyRaw, historie, publikace] = await Promise.all([
    prisma.zdroj.findMany({ where: { cilovyTyp: "Udalost", cilovyId: udalost.id }, orderBy: { createdAt: "desc" } }),
    prisma.vazba.findMany({ where: { zdrojovyTyp: "Udalost", zdrojovyId: udalost.id }, orderBy: { createdAt: "desc" } }),
    prisma.historieZmeny.findMany({ where: { entitaTyp: "Udalost", entitaId: udalost.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.publikace.findMany({ where: { udalostId: udalost.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const vazby = await Promise.all(vazbyRaw.map(async (v) => ({ ...v, cilovyNazev: await nazevObjektu(v.cilovyTyp, v.cilovyId) })));
  const dalsiStav = DALSI_STAV[udalost.stav];
  const bezZdroje = zdroje.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="tab-label mb-2">
          <Link href="/udalosti" className="hover:text-accent">Události</Link> / {udalost.nazev}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display text-3xl text-paper">{udalost.nazev}</h1>
          <StatusBadge stav={udalost.stav} />
          {udalost.zdrojAI && (
            <span className="text-xs font-mono px-2 py-0.5 rounded-sm border border-accent/40 text-accent">AI návrh</span>
          )}
        </div>
        <p className="text-muted text-sm mt-1 font-mono">{udalost.datum}{udalost.opakujeSe ? " · každoročně" : ""}</p>
      </div>

      {bezZdroje && (
        <div className="border border-rust/40 bg-rust/10 text-rust text-sm rounded-sm px-4 py-2">
          Tato událost zatím nemá žádný zdroj. Lepší je označit údaj jako neověřený, než ho prezentovat jako fakt.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <IndexCard>
            {udalost.popis ? (
              <p className="text-paper whitespace-pre-wrap leading-relaxed mb-3">{udalost.popis}</p>
            ) : (
              <p className="text-muted text-sm mb-3">Zatím bez popisu.</p>
            )}
            <form action={rozsiritUdalost.bind(null, udalost.id)}>
              <button className="text-xs bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring">
                Zjisti více (AI)
              </button>
            </form>
          </IndexCard>

          <IndexCard label="Fotka pro sociální grafiku">
            {udalost.fotoUrl ? (
              <img src={udalost.fotoUrl} alt="" className="rounded-sm mb-3 max-h-64 object-cover" />
            ) : (
              <p className="text-muted text-sm mb-3">Zatím bez fotky – použij oficiální press foto interpreta.</p>
            )}
            <form action={nahratFotkuUdalosti.bind(null, udalost.id)} className="flex gap-2 items-center text-sm">
              <input type="file" name="foto" accept="image/*" required className="text-muted text-xs" />
              <button className="bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring shrink-0">
                Nahrát
              </button>
            </form>
          </IndexCard>

          <VazbySekce zdrojovyTyp="Udalost" zdrojovyId={udalost.id} cesta={cesta} vazby={vazby} />
          <ZdrojeSekce cilovyTyp="Udalost" cilovyId={udalost.id} cesta={cesta} zdroje={zdroje} />
        </div>

        <div className="space-y-5">
          <IndexCard label="Publikace na sítích">
            <p className="text-muted text-sm mb-3">
              {udalost.zverejnitNaSitich
                ? "Vybráno ke zveřejnění na mufloních sítích."
                : "Zatím nevybráno ke zveřejnění."}
            </p>
            <form action={prepnoutZverejneni.bind(null, udalost.id, udalost.zverejnitNaSitich)} className="mb-4">
              <button
                className={`w-full rounded-sm px-3 py-1.5 text-sm border focus-ring transition-colors ${
                  udalost.zverejnitNaSitich
                    ? "border-sage/50 text-sage bg-sage/10 hover:bg-sage/20"
                    : "border-accent/40 text-accent bg-accentDim/30 hover:bg-accentDim/50"
                }`}
              >
                {udalost.zverejnitNaSitich ? "✓ Zveřejnit na sítích" : "Zveřejnit na sítích"}
              </button>
            </form>

            <p className="tab-label mb-2">Náhled grafiky</p>
            <img src={`/api/socialni/obrazek/${udalost.id}`} alt="" className="w-full rounded-sm border border-line mb-4" />

            <div className="grid grid-cols-2 gap-2 mb-4">
              <form action={publikovatNaFacebook.bind(null, udalost.id)}>
                <button className="w-full text-xs bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring">
                  Publikovat na Facebook
                </button>
              </form>
              <form action={publikovatNaInstagram.bind(null, udalost.id)}>
                <button className="w-full text-xs bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring">
                  Publikovat na Instagram
                </button>
              </form>
            </div>

            {publikace.length > 0 && (
              <ul className="space-y-1.5 text-xs font-mono">
                {publikace.map((p) => (
                  <li key={p.id} className="flex items-center justify-between border-t border-line/60 pt-1.5">
                    <span className="text-muted capitalize">{p.platforma}</span>
                    <span className={p.stav === "publikovano" ? "text-sage" : "text-rust"}>
                      {p.stav === "publikovano" ? "✓ publikováno" : `✗ ${p.chybaText?.slice(0, 60) ?? "chyba"}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </IndexCard>

          <IndexCard label="Redakční workflow">
            <p className="text-muted text-sm mb-3">Aktuální stav: <StatusBadge stav={udalost.stav} /></p>
            {dalsiStav ? (
              bezZdroje ? (
                <p className="text-rust text-xs">
                  Nejdřív přidej aspoň jeden zdroj – bez něj stav nejde posunout dál.
                </p>
              ) : (
                <form action={posunoutStav.bind(null, "udalost", udalost.id, udalost.stav, cesta)}>
                  <button className="w-full bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring text-sm">
                    Posunout na „{STAV_LABEL[dalsiStav]}“
                  </button>
                </form>
              )
            ) : (
              <p className="text-muted text-xs">Konečný stav dosažen.</p>
            )}
          </IndexCard>

          <IndexCard label="Upravit záznam">
            <form action={upravitUdalost.bind(null, udalost.id)} className="space-y-2 text-sm">
              <input name="nazev" defaultValue={udalost.nazev} className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <select name="typ" defaultValue={udalost.typ} className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring">
                <option value="vyroci_alba">Výročí alba</option>
                <option value="narozeniny">Narozeniny</option>
                <option value="umrti">Úmrtí</option>
                <option value="jina">Jiná událost</option>
              </select>
              <input name="datum" defaultValue={udalost.datum} className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <label className="flex items-center gap-2 text-muted text-sm">
                <input type="checkbox" name="opakujeSe" defaultChecked={udalost.opakujeSe} /> každoročně
              </label>
              <textarea name="popis" defaultValue={udalost.popis ?? ""} rows={3} className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
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

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import IndexCard from "@/components/IndexCard";
import ZdrojeSekce from "@/components/ZdrojeSekce";
import VazbySekce from "@/components/VazbySekce";
import HistorieSekce from "@/components/HistorieSekce";
import { upravitSkladbu } from "@/lib/actions/skladby";
import { nazevObjektu } from "@/lib/actions/spolecne";

export default async function SkladbaDetail({ params }: { params: { id: string } }) {
  const skladba = await prisma.skladba.findUnique({
    where: { id: params.id },
    include: { interpreti: { include: { interpret: true } }, album: true },
  });
  if (!skladba) notFound();

  const cesta = `/skladby/${skladba.id}`;
  const [zdroje, vazbyRaw, historie] = await Promise.all([
    prisma.zdroj.findMany({ where: { cilovyTyp: "Skladba", cilovyId: skladba.id }, orderBy: { createdAt: "desc" } }),
    prisma.vazba.findMany({ where: { zdrojovyTyp: "Skladba", zdrojovyId: skladba.id }, orderBy: { createdAt: "desc" } }),
    prisma.historieZmeny.findMany({ where: { entitaTyp: "Skladba", entitaId: skladba.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const vazby = await Promise.all(vazbyRaw.map(async (v) => ({ ...v, cilovyNazev: await nazevObjektu(v.cilovyTyp, v.cilovyId) })));

  return (
    <div className="space-y-6">
      <div>
        <p className="tab-label mb-2">
          <Link href="/skladby" className="hover:text-accent">Skladby</Link> / {skladba.nazev}
        </p>
        <h1 className="font-display text-3xl text-paper">{skladba.nazev}</h1>
        <p className="text-muted text-sm mt-1">
          {skladba.interpreti.map((i, idx) => (
            <span key={i.id}>
              {idx > 0 && ", "}
              <Link href={`/interpreti/${i.interpretId}`} className="hover:text-accent">{i.interpret.nazev}</Link>
            </span>
          ))}
          {skladba.album && (
            <>
              {" · "}
              <Link href={`/alba/${skladba.album.id}`} className="hover:text-accent">{skladba.album.nazev}</Link>
            </>
          )}
        </p>
        <p className="text-muted text-xs font-mono mt-1">
          {skladba.vPlaylistu ? "v playlistu Rádia Muflon" : "mimo playlist"}
          {skladba.verze ? ` · verze: ${skladba.verze}` : ""}
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <VazbySekce zdrojovyTyp="Skladba" zdrojovyId={skladba.id} cesta={cesta} vazby={vazby} />
          <ZdrojeSekce cilovyTyp="Skladba" cilovyId={skladba.id} cesta={cesta} zdroje={zdroje} />
        </div>

        <div className="space-y-5">
          <IndexCard label="Upravit záznam">
            <form action={upravitSkladbu.bind(null, skladba.id)} className="space-y-2 text-sm">
              <input name="nazev" defaultValue={skladba.nazev} className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <input name="verze" defaultValue={skladba.verze ?? ""} placeholder="Verze" className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <input name="datumPrvnihoVydani" defaultValue={skladba.datumPrvnihoVydani ?? ""} placeholder="Datum prvního vydání" className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <label className="flex items-center gap-2 text-muted text-sm">
                <input type="checkbox" name="vPlaylistu" defaultChecked={skladba.vPlaylistu} /> v playlistu Rádia Muflon
              </label>
              <textarea name="poznamka" defaultValue={skladba.poznamka ?? ""} rows={3} placeholder="Poznámka" className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
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

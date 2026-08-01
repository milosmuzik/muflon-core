import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import IndexCard from "@/components/IndexCard";
import ZdrojeSekce from "@/components/ZdrojeSekce";
import VazbySekce from "@/components/VazbySekce";
import HistorieSekce from "@/components/HistorieSekce";
import { upravitAlbum } from "@/lib/actions/alba";
import { nazevObjektu } from "@/lib/actions/spolecne";

export default async function AlbumDetail({ params }: { params: { id: string } }) {
  const album = await prisma.album.findUnique({
    where: { id: params.id },
    include: { interpreti: { include: { interpret: true } }, skladby: true },
  });
  if (!album) notFound();

  const cesta = `/alba/${album.id}`;
  const [zdroje, vazbyRaw, historie] = await Promise.all([
    prisma.zdroj.findMany({ where: { cilovyTyp: "Album", cilovyId: album.id }, orderBy: { createdAt: "desc" } }),
    prisma.vazba.findMany({ where: { zdrojovyTyp: "Album", zdrojovyId: album.id }, orderBy: { createdAt: "desc" } }),
    prisma.historieZmeny.findMany({ where: { entitaTyp: "Album", entitaId: album.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const vazby = await Promise.all(vazbyRaw.map(async (v) => ({ ...v, cilovyNazev: await nazevObjektu(v.cilovyTyp, v.cilovyId) })));

  return (
    <div className="space-y-6">
      <div>
        <p className="tab-label mb-2">
          <Link href="/alba" className="hover:text-accent">Alba</Link> / {album.nazev}
        </p>
        <h1 className="font-display text-3xl text-paper">{album.nazev}</h1>
        <p className="text-muted text-sm mt-1">
          {album.interpreti.map((i, idx) => (
            <span key={i.id}>
              {idx > 0 && ", "}
              <Link href={`/interpreti/${i.interpretId}`} className="hover:text-accent">{i.interpret.nazev}</Link>
            </span>
          ))}
          {album.datumVydani && ` · ${album.datumVydani}`}
          {album.vydavatel && ` · ${album.vydavatel}`}
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <IndexCard label={`Skladby (${album.skladby.length})`}>
            {album.skladby.length === 0 ? (
              <p className="text-muted text-sm">Zatím žádné skladby přiřazené k tomuto albu.</p>
            ) : (
              <ul className="grid sm:grid-cols-2 gap-1.5">
                {album.skladby.map((s) => (
                  <li key={s.id}>
                    <Link href={`/skladby/${s.id}`} className="text-sm text-paper hover:text-accent">{s.nazev}</Link>
                  </li>
                ))}
              </ul>
            )}
          </IndexCard>

          <VazbySekce zdrojovyTyp="Album" zdrojovyId={album.id} cesta={cesta} vazby={vazby} />
          <ZdrojeSekce cilovyTyp="Album" cilovyId={album.id} cesta={cesta} zdroje={zdroje} />
        </div>

        <div className="space-y-5">
          <IndexCard label="Upravit záznam">
            <form action={upravitAlbum.bind(null, album.id)} className="space-y-2 text-sm">
              <input name="nazev" defaultValue={album.nazev} className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <input name="datumVydani" defaultValue={album.datumVydani ?? ""} placeholder="Datum vydání" className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <input name="vydavatel" defaultValue={album.vydavatel ?? ""} placeholder="Vydavatel" className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
              <textarea name="poznamka" defaultValue={album.poznamka ?? ""} rows={3} placeholder="Poznámka" className="w-full bg-ink border border-line rounded-sm px-2 py-1.5 text-paper focus-ring" />
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

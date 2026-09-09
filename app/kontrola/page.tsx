import { prisma } from "@/lib/prisma";
import IndexCard from "@/components/IndexCard";
import SdruzenaKontrolaTlacitko from "@/components/SdruzenaKontrolaTlacitko";
import { pocetCekajicichNaWhitelist } from "@/lib/agent/automaticka-revize";
import { pocetFeatKOprave } from "@/lib/agent/uklid-feat";
import {
  AUTOSCHVALENI_OD_UROVNE,
  urovenDuveryPriorita,
  urovenDuveryZeZdroje,
} from "@/lib/constants";
import { prehledBezZdroje } from "@/lib/bez-zdroje";
import Link from "next/link";

export const maxDuration = 60;

export default async function KontrolaPage() {
  const [zbyva, pribehyHotovo, udalostiHotovo, featKOprave, bezZdroje] = await Promise.all([
    pocetCekajicichNaWhitelist(),
    pocetSWhitelistem("Pribeh"),
    pocetSWhitelistem("Udalost"),
    pocetFeatKOprave(),
    prehledBezZdroje(8),
  ]);

  const celkemBezZdroje = Object.values(bezZdroje.pocty).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="tab-label mb-2">Ručně, jeden klik</p>
        <h1 className="font-display text-2xl text-paper">Kontrola kvality</h1>
        <p className="text-muted text-sm mt-1">
          Automatický noční import je vypnutý. Vše běží jen tady.
        </p>
      </div>

      <IndexCard label="Sdružená kontrola">
        <p className="text-muted text-sm mb-3">
          Jedna dávka udělá feat/ft, doplní katalog (MA/MB), dohledá zdroje a ověří příběhy/události.
          Klikni znovu, když zbývá práce. Nic se nespouští samo.
        </p>
        <p className="text-muted text-xs font-mono mb-3">
          Čeká na whitelist: {zbyva} · feat/ft: {featKOprave} · bez zdroje: {celkemBezZdroje} ·
          whitelist už drží {pribehyHotovo} příběhů a {udalostiHotovo} událostí
        </p>
        <SdruzenaKontrolaTlacitko />
      </IndexCard>

      <IndexCard label="Bez zdroje (přehled)">
        {celkemBezZdroje === 0 ? (
          <p className="text-muted text-sm">Nic nechybí.</p>
        ) : (
          <>
            <p className="text-muted text-xs font-mono mb-3">
              {Object.entries(bezZdroje.pocty)
                .map(([typ, n]) => `${typ} ${n}`)
                .join(" · ")}
            </p>
            <ul className="space-y-2">
              {bezZdroje.vzorek.map((r) => (
                <li key={`${r.typ}:${r.id}`} className="flex items-center justify-between text-sm border-b border-line/60 pb-2 gap-3">
                  <Link href={r.href} className="text-paper hover:text-accent truncate">
                    {r.nazev}
                  </Link>
                  <span className="tab-label shrink-0">{r.label}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </IndexCard>
    </div>
  );
}

async function pocetSWhitelistem(typ: "Pribeh" | "Udalost"): Promise<number> {
  const zdroje = await prisma.zdroj.findMany({
    where: { cilovyTyp: typ },
    select: { cilovyId: true, kategorie: true, url: true },
  });
  const ids = new Set<string>();
  for (const z of zdroje) {
    if (urovenDuveryPriorita(urovenDuveryZeZdroje(z.kategorie, z.url)) >= AUTOSCHVALENI_OD_UROVNE) {
      ids.add(z.cilovyId);
    }
  }
  return ids.size;
}

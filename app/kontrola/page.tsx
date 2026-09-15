import { prisma } from "@/lib/prisma";
import IndexCard from "@/components/IndexCard";
import SdruzenaKontrolaTlacitko from "@/components/SdruzenaKontrolaTlacitko";
import KatalogovaDavkaTlacitko from "@/components/KatalogovaDavkaTlacitko";
import { pocetCekajicichNaWhitelist } from "@/lib/agent/automaticka-revize";
import { pocetFeatKOprave } from "@/lib/agent/uklid-feat";
import {
  AUTOSCHVALENI_OD_UROVNE,
  urovenDuveryPriorita,
  urovenDuveryZeZdroje,
} from "@/lib/constants";
import { prehledBezZdroje } from "@/lib/bez-zdroje";
import { stavRozpoctu } from "@/lib/agent/rozpocet";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function KontrolaPage() {
  const [zbyva, pribehyHotovo, udalostiHotovo, featKOprave, bezZdroje, rozpocet] = await Promise.all([
    pocetCekajicichNaWhitelist(),
    pocetSWhitelistem("Pribeh"),
    pocetSWhitelistem("Udalost"),
    pocetFeatKOprave(),
    prehledBezZdroje(8),
    stavRozpoctu(),
  ]);

  const celkemBezZdroje = Object.values(bezZdroje.pocty).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="tab-label mb-2">Ručně, jeden klik</p>
        <h1 className="font-display text-2xl text-paper">Kontrola kvality</h1>
        <p className="text-muted text-sm mt-1">
          Automatický noční import je vypnutý. Výročí se berou z katalogu, ne z Gemini.
        </p>
      </div>

      <IndexCard label="Gemini rozpočet (grounding)">
        <p className="text-muted text-xs font-mono">
          Dnes ({rozpocet.den}): {rozpocet.groundedDnes} / {rozpocet.strop} groundovaných volání
          (bezpečný strop appky; Google limit {rozpocet.limitGoogle}/den) · zbývá {rozpocet.zbyva}
          {rozpocet.jisticAktivni ? " · ⚠️ jistič aktivní (poslední 429/503)" : ""}
        </p>
      </IndexCard>

      <IndexCard label="Katalog → kalendář a příběhy">
        <p className="text-muted text-sm mb-3">
          Nejdřív odpad. Pak výročí z dat alb a hudebníků (MusicBrainz jen když datum chybí).
          Příběhy ze stávající historie, Gemini jen když text není — max 10.
        </p>
        <KatalogovaDavkaTlacitko />
      </IndexCard>

      <IndexCard label="Sdružená kontrola">
        <p className="text-muted text-sm mb-3">
          Odpad, feat, výročí, katalog, zdroje, revize. Nic se nespouští samo.
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

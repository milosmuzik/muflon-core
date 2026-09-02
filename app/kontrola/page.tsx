import { prisma } from "@/lib/prisma";
import IndexCard from "@/components/IndexCard";
import AutomatickaRevizeTlacitko from "@/components/AutomatickaRevizeTlacitko";
import OpravaFeatTlacitko from "@/components/OpravaFeatTlacitko";
import DoplnitKatalogTlacitko from "@/components/DoplnitKatalogTlacitko";
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
        <p className="tab-label mb-2">Systém rozhoduje sám</p>
        <h1 className="font-display text-2xl text-paper">Kontrola kvality</h1>
        <p className="text-muted text-sm mt-1">
          {zbyva === 0
            ? "Všechny příběhy a události už mají whitelistový zdroj, nebo jsou pryč."
            : `${zbyva} příběhů a událostí čeká na rozhodnutí systému.`}
        </p>
      </div>

      <IndexCard label="Doplnit hudebníky a alba">
        <p className="text-muted text-sm mb-3">
          Nejdřív Metal Archives a MusicBrainz (bez kvóty). Gemini jen na chybějící text, a jen
          když má kredit. Hudebníky ani alba nemaže.
        </p>
        <DoplnitKatalogTlacitko />
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

      <IndexCard label="Ověřit příběhy a události">
        <p className="text-muted text-sm mb-3">
          Jeden klik. Nejdřív whitelist a Metal Archives. Gemini jen když je kvóta. Při 429 se
          dávka zastaví a návrhy se nemažou. Interprety, hudebníky, alba a skladby z playlistu
          nesahá. Mazání je jen u příběhů a událostí, a jen po jistém „zdroj není“.
        </p>
        <AutomatickaRevizeTlacitko />
        <p className="text-muted text-xs mt-3 font-mono">
          Už drží whitelist: {pribehyHotovo} příběhů, {udalostiHotovo} událostí
        </p>
      </IndexCard>

      <IndexCard label="Opravit feat / ft">
        <p className="text-muted text-sm mb-3">
          Falešné karty typu „Kapela Ft. Host“ se rozdělí. Nic se ti nepřidá ke schválení.
        </p>
        <OpravaFeatTlacitko />
        <p className="text-muted text-xs mt-3 font-mono">
          {featKOprave === 0 ? "Žádná falešná karta s feat/ft." : `${featKOprave} interpretů má feat/ft v názvu.`}
        </p>
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

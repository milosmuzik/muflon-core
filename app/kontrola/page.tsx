import { prisma } from "@/lib/prisma";
import IndexCard from "@/components/IndexCard";
import AutomatickaRevizeTlacitko from "@/components/AutomatickaRevizeTlacitko";
import { pocetCekajicichNaWhitelist } from "@/lib/agent/automaticka-revize";
import {
  AUTOSCHVALENI_OD_UROVNE,
  urovenDuveryPriorita,
  urovenDuveryZeZdroje,
} from "@/lib/constants";

export const maxDuration = 60;

export default async function KontrolaPage() {
  const [zbyva, pribehyHotovo, udalostiHotovo] = await Promise.all([
    pocetCekajicichNaWhitelist(),
    pocetSWhitelistem("Pribeh"),
    pocetSWhitelistem("Udalost"),
  ]);

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

      <IndexCard label="Ověřit všechna data">
        <p className="text-muted text-sm mb-3">
          Jeden klik. Systém podle whitelistu schválí, nebo smaže. Nic se nevrací na návrh a nic
          nového se ti nepřidá k ručnímu schválení. Interprety, alba a skladby z playlistu nesahá.
          Když tab necháš otevřený, dávky běží samy do nuly. Stejná práce běží i v noci cronem.
          Mazání je nevratné.
        </p>
        <AutomatickaRevizeTlacitko />
        <p className="text-muted text-xs mt-3 font-mono">
          Už drží whitelist: {pribehyHotovo} příběhů, {udalostiHotovo} událostí
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

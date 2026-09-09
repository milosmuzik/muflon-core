"use client";

import { useState } from "react";
import { spustitSdruzeneKontrolu, type VysledekSdruzeneKontroly } from "@/lib/actions/kontrola";

export default function SdruzenaKontrolaTlacitko() {
  const [bezi, setBezi] = useState(false);
  const [davka, setDavka] = useState(0);
  const [posledni, setPosledni] = useState<VysledekSdruzeneKontroly | null>(null);
  const [soucet, setSoucet] = useState({
    katalog: 0,
    feat: 0,
    zdroje: 0,
    schvaleno: 0,
    vyroci: 0,
  });

  async function spustit() {
    setBezi(true);
    setDavka(0);
    let k = 0;
    let f = 0;
    let z = 0;
    let s = 0;
    let y = 0;
    try {
      for (let i = 0; i < 4; i++) {
        const vysledek = await spustitSdruzeneKontrolu();
        setPosledni(vysledek);
        k += vysledek.katalog.doplneno;
        f += vysledek.feat.opravenoInterpretu;
        z += vysledek.zdroje.nalezeno;
        s += vysledek.revize.schvaleno;
        y += vysledek.vyroci.alba + vysledek.vyroci.hudebnici;
        setSoucet({ katalog: k, feat: f, zdroje: z, schvaleno: s, vyroci: y });
        setDavka(i + 1);
        if (vysledek.chyby.some((c) => /kvóta|429|RESOURCE_EXHAUSTED/i.test(c))) break;
        const nic =
          vysledek.katalog.doplneno +
            vysledek.feat.opravenoInterpretu +
            vysledek.zdroje.nalezeno +
            vysledek.revize.schvaleno +
            vysledek.revize.dohledano +
            vysledek.vyroci.alba +
            vysledek.odpad.smazano ===
          0;
        if (nic && vysledek.revize.hotovo && vysledek.feat.hotovo) break;
      }
    } finally {
      setBezi(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={bezi}
        onClick={spustit}
        className="bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring text-sm disabled:opacity-50"
      >
        {bezi ? `Běží dávka ${davka + 1}… nech tab otevřený` : "Spustit sdruženou kontrolu"}
      </button>
      {davka > 0 && (
        <p className="mt-3 text-sm text-paper">
          Dávek: {davka} · Výročí +{soucet.vyroci} · Katalog +{soucet.katalog} · Feat {soucet.feat} ·
          Zdroje +{soucet.zdroje} · Schváleno {soucet.schvaleno}
        </p>
      )}
      {posledni?.chyby.length ? (
        <ul className="mt-2 text-xs text-rust space-y-1">
          {posledni.chyby.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

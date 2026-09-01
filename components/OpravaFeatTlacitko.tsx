"use client";

import { useState } from "react";
import { spustitOpravuFeatRucne } from "@/lib/actions/kontrola";
import type { VysledekUkliduFeat } from "@/lib/agent/uklid-feat";

const pocatek: VysledekUkliduFeat = {
  opravenoInterpretu: 0,
  napojenoHostu: 0,
  slouceno: 0,
  zbyva: 0,
  hotovo: false,
  chyby: [],
};

export default function OpravaFeatTlacitko() {
  const [stav, setStav] = useState(pocatek);
  const [bezi, setBezi] = useState(false);
  const [davka, setDavka] = useState(0);

  async function spustit() {
    setBezi(true);
    setDavka(0);
    let soucet = pocatek;
    try {
      for (;;) {
        const vysledek = await spustitOpravuFeatRucne();
        soucet = {
          opravenoInterpretu: soucet.opravenoInterpretu + vysledek.opravenoInterpretu,
          napojenoHostu: soucet.napojenoHostu + vysledek.napojenoHostu,
          slouceno: soucet.slouceno + vysledek.slouceno,
          zbyva: vysledek.zbyva,
          hotovo: vysledek.hotovo,
          chyby: [...soucet.chyby, ...vysledek.chyby].slice(-8),
        };
        setStav(soucet);
        setDavka((n) => n + 1);
        if (vysledek.hotovo || vysledek.chyby.length > 4) break;
        if (vysledek.opravenoInterpretu + vysledek.napojenoHostu + vysledek.slouceno === 0) break;
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
        {bezi ? `Řeším dávku ${davka + 1}…` : "Opravit feat / ft"}
      </button>
      {(davka > 0 || stav.chyby.length > 0) && (
        <p className="mt-3 text-sm text-paper">
          {stav.hotovo ? "Hotovo. " : `Zbývá falešných karet: ${stav.zbyva}. `}
          Opraveno interpretů: {stav.opravenoInterpretu} · Hostů napojeno: {stav.napojenoHostu}{" "}
          · Sloučeno: {stav.slouceno}
        </p>
      )}
      {stav.chyby.length > 0 && (
        <ul className="mt-2 text-xs text-rust space-y-1">
          {stav.chyby.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

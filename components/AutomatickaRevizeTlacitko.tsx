"use client";

import { useState } from "react";
import { spustitAutomatickouReviziRucne } from "@/lib/actions/kontrola";
import type { VysledekAutomatickeRevize } from "@/lib/agent/automaticka-revize";

const pocatecniStav: VysledekAutomatickeRevize = {
  schvaleno: 0,
  smazanoNedostatecnyZdroj: 0,
  dohledano: 0,
  smazanoBezZdroje: 0,
  sloucenoDuplicit: 0,
  zbyva: 0,
  hotovo: false,
  chyby: [],
};

function secti(a: VysledekAutomatickeRevize, b: VysledekAutomatickeRevize): VysledekAutomatickeRevize {
  return {
    schvaleno: a.schvaleno + b.schvaleno,
    smazanoNedostatecnyZdroj: a.smazanoNedostatecnyZdroj + b.smazanoNedostatecnyZdroj,
    dohledano: a.dohledano + b.dohledano,
    smazanoBezZdroje: a.smazanoBezZdroje + b.smazanoBezZdroje,
    sloucenoDuplicit: a.sloucenoDuplicit + b.sloucenoDuplicit,
    zbyva: b.zbyva,
    hotovo: b.hotovo,
    chyby: [...a.chyby, ...b.chyby].slice(-8),
  };
}

export default function AutomatickaRevizeTlacitko() {
  const [stav, setStav] = useState<VysledekAutomatickeRevize>(pocatecniStav);
  const [bezi, setBezi] = useState(false);
  const [davka, setDavka] = useState(0);

  async function spustit() {
    setBezi(true);
    setDavka(0);
    let soucet = pocatecniStav;
    try {
      for (;;) {
        const vysledek = await spustitAutomatickouReviziRucne(soucet);
        soucet = secti(soucet, vysledek);
        setStav(soucet);
        setDavka((n) => n + 1);
        if (vysledek.hotovo || vysledek.chyby.length > 4) break;
      }
    } finally {
      setBezi(false);
    }
  }

  const probehlo =
    davka > 0 ||
    stav.schvaleno +
      stav.smazanoNedostatecnyZdroj +
      stav.dohledano +
      stav.smazanoBezZdroje +
      stav.sloucenoDuplicit +
      stav.chyby.length >
      0;

  return (
    <div>
      <button
        type="button"
        disabled={bezi}
        onClick={spustit}
        className="bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring text-sm disabled:opacity-50"
      >
        {bezi ? `Běží dávka ${davka + 1}… nech tab otevřený` : "Ověřit všechna data"}
      </button>
      {probehlo && (
        <p className="mt-3 text-sm text-paper">
          {stav.hotovo ? "Hotovo. " : bezi ? `Ještě zbývá ${stav.zbyva}. ` : `Zbývá ${stav.zbyva}. `}
          Schváleno: {stav.schvaleno} · Dohledáno: {stav.dohledano} · Smazáno (slabý zdroj):{" "}
          {stav.smazanoNedostatecnyZdroj} · Smazáno (bez zdroje): {stav.smazanoBezZdroje}
          {stav.sloucenoDuplicit > 0 ? ` · Sloučeno duplicit: ${stav.sloucenoDuplicit}` : ""}
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

"use client";

import { useState } from "react";
import { opravitCeskyVanaheim } from "@/lib/actions/interpreti";

export default function OpravitVanaheimTlacitko({ interpretId }: { interpretId: string }) {
  const [bezi, setBezi] = useState(false);
  const [zprava, setZprava] = useState<string | null>(null);

  async function spustit() {
    setBezi(true);
    setZprava(null);
    try {
      const vysledek = await opravitCeskyVanaheim(interpretId);
      if (!vysledek.ok) {
        setZprava(vysledek.chyba);
        return;
      }
      const v = vysledek.vysledek;
      setZprava(
        v
          ? `Česká karta uložena. Smazáno členství: ${v.smazanoClenstvi}, přidáno: ${v.pridanoClenstvi}. Odpojeno alb: ${v.odpojenoAlb}, přidáno: ${v.pridanoAlb}. Odpojeno skladeb: ${v.odpojenoSkladeb}.`
          : "Hotovo.",
      );
    } catch (e) {
      setZprava(String(e));
    } finally {
      setBezi(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={bezi}
        onClick={spustit}
        className="w-full bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring text-sm disabled:opacity-50"
      >
        {bezi ? "Přepisuju na českou kapelu…" : "Přepsat na český Vanaheim"}
      </button>
      {zprava && <p className="text-xs text-paper leading-relaxed">{zprava}</p>}
    </div>
  );
}

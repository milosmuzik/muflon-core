"use client";

import { useState } from "react";
import {
  spustitDoplneniPribehu,
  spustitUklidOdpadu,
  spustitVyrociZKatalogu,
} from "@/lib/actions/kontrola";

export default function KatalogovaDavkaTlacitko() {
  const [bezi, setBezi] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [chyby, setChyby] = useState<string[]>([]);

  async function uklid() {
    setBezi("uklid");
    try {
      const v = await spustitUklidOdpadu();
      setText(
        v.smazano === 0
          ? "Žádný odpad."
          : `Smazáno ${v.smazano}: ${v.nazvy.join(", ")}`,
      );
      setChyby([]);
    } finally {
      setBezi(null);
    }
  }

  async function vyroci() {
    setBezi("vyroci");
    try {
      const v = await spustitVyrociZKatalogu();
      setText(
        `Alba +${v.alba} · hudebníci +${v.hudebnici} · doplněná data ${v.doplnenaData} · přeskočeno ${v.preskoceno}`,
      );
      setChyby(v.chyby);
    } finally {
      setBezi(null);
    }
  }

  async function pribehy() {
    setBezi("pribehy");
    try {
      const v = await spustitDoplneniPribehu();
      setText(
        `Šablona +${v.zeSablony} · Gemini +${v.zGemini} · přeskočeno ${v.preskoceno} · zbývá ${v.zbyva}`,
      );
      setChyby(v.chyby);
    } finally {
      setBezi(null);
    }
  }

  const cls =
    "bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring text-sm disabled:opacity-50";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!!bezi} onClick={uklid} className={cls}>
          {bezi === "uklid" ? "Mažu odpad…" : "Smazat odpadové karty"}
        </button>
        <button type="button" disabled={!!bezi} onClick={vyroci} className={cls}>
          {bezi === "vyroci" ? "Skládám výročí…" : "Doplnit výročí z katalogu"}
        </button>
        <button type="button" disabled={!!bezi} onClick={pribehy} className={cls}>
          {bezi === "pribehy" ? "Píšu příběhy…" : "Napsat chybějící příběhy (max 10)"}
        </button>
      </div>
      {text ? <p className="text-sm text-paper">{text}</p> : null}
      {chyby.length > 0 && (
        <ul className="text-xs text-rust space-y-1">
          {chyby.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

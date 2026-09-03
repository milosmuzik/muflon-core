"use client";

import { useState } from "react";
import { smazatInterpreta } from "@/lib/actions/interpreti";

export default function SmazatKartuTlacitko({
  interpretId,
  nazev,
}: {
  interpretId: string;
  nazev: string;
}) {
  const [bezi, setBezi] = useState(false);

  async function smazat() {
    const ok = window.confirm(
      `Šmazat kartu „${nazev}“ včetně členství, vazeb na alba/skladby, zdrojů a obecných vazeb? Skladby v playlistu zůstanou.`,
    );
    if (!ok) return;
    setBezi(true);
    await smazatInterpreta(interpretId);
  }

  return (
    <button
      type="button"
      disabled={bezi}
      onClick={smazat}
      className="w-full border border-rust/50 text-rust rounded-sm px-3 py-1.5 hover:bg-rust/10 transition-colors focus-ring text-sm disabled:opacity-50"
    >
      {bezi ? "Mažu…" : "Smazat kartu včetně vazeb"}
    </button>
  );
}

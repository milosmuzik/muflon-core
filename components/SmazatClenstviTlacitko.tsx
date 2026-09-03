"use client";

import { smazatClenstvi } from "@/lib/actions/interpreti";
import { useState } from "react";

export default function SmazatClenstviTlacitko({
  clenstviId,
  interpretId,
}: {
  clenstviId: string;
  interpretId: string;
}) {
  const [bezi, setBezi] = useState(false);
  return (
    <button
      type="button"
      disabled={bezi}
      onClick={async () => {
        setBezi(true);
        await smazatClenstvi(clenstviId, interpretId);
      }}
      className="text-muted hover:text-rust text-xs font-mono px-1 focus-ring"
      title="Odpojit od karty"
    >
      {bezi ? "…" : "×"}
    </button>
  );
}

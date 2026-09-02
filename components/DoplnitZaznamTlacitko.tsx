"use client";

import { useFormState, useFormStatus } from "react-dom";
import { spustitDoplneniZaznamu } from "@/lib/actions/kontrola";

const pocatek = { ok: false, text: "" };

function Tlacitko() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="w-full bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring text-sm disabled:opacity-50"
    >
      {pending ? "Hledám data…" : "Najít další data"}
    </button>
  );
}

export default function DoplnitZaznamTlacitko({
  typ,
  id,
}: {
  typ: "Hudebnik" | "Album";
  id: string;
}) {
  const [stav, action] = useFormState(spustitDoplneniZaznamu.bind(null, typ, id), pocatek);
  return (
    <div>
      <form action={action}>
        <Tlacitko />
      </form>
      {stav.text && <p className="text-muted text-xs mt-2">{stav.text}</p>}
    </div>
  );
}

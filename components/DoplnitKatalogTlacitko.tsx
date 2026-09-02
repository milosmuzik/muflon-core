"use client";

import { useFormState, useFormStatus } from "react-dom";
import { spustitDoplneniKatalogu } from "@/lib/actions/kontrola";

const pocatek = { zpracovano: 0, doplneno: 0, zdroje: 0, chyby: [] as string[] };

function Tlacitko() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring text-sm disabled:opacity-50"
    >
      {pending ? "Hledám data…" : "Doplnit hudebníky a alba"}
    </button>
  );
}

export default function DoplnitKatalogTlacitko() {
  const [stav, action] = useFormState(spustitDoplneniKatalogu, pocatek);
  return (
    <div>
      <form action={action}>
        <Tlacitko />
      </form>
      {stav.zpracovano > 0 && (
        <p className="text-paper text-sm mt-3">
          Zpracováno {stav.zpracovano} · doplněno {stav.doplneno} · zdrojů +{stav.zdroje}
        </p>
      )}
      {stav.chyby.length > 0 && (
        <ul className="text-rust text-xs mt-1">
          {stav.chyby.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

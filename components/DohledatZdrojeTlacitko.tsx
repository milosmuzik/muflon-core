"use client";

import { useFormState, useFormStatus } from "react-dom";
import { spustitDohledaniRucne } from "@/lib/actions/kontrola";

const pocatecniStav = { zkontrolovano: 0, nalezeno: 0, chyby: [] as string[] };

function TlacitkoOdeslat() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring text-sm disabled:opacity-50"
    >
      {pending ? "Hledám… (může trvat i minutu)" : "Dohledat zdroje (další dávka)"}
    </button>
  );
}

export default function DohledatZdrojeTlacitko() {
  const [stav, formAction] = useFormState(spustitDohledaniRucne, pocatecniStav);

  return (
    <div>
      <form action={formAction}>
        <TlacitkoOdeslat />
      </form>
      {stav.zkontrolovano > 0 && (
        <div className="mt-3 text-sm space-y-1">
          <p className="text-paper">
            Zkontrolováno v téhle dávce: {stav.zkontrolovano} · Nalezen zdroj: {stav.nalezeno}
          </p>
          {stav.chyby.length > 0 && (
            <ul className="text-rust text-xs space-y-0.5">
              {stav.chyby.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

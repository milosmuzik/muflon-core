"use client";

import { useFormState, useFormStatus } from "react-dom";
import { spustitUklidRucne } from "@/lib/actions/kontrola";

const pocatecniStav = { zkontrolovano: 0, smazanoUdalosti: 0, smazanoPribehu: 0 };

function TlacitkoOdeslat() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="bg-rust/10 border border-rust/50 text-rust rounded-sm px-3 py-1.5 hover:bg-rust/20 transition-colors focus-ring text-sm disabled:opacity-50"
    >
      {pending ? "Mažu…" : "Nevratně smazat nekvalifikované"}
    </button>
  );
}

export default function UklidTlacitko() {
  const [stav, formAction] = useFormState(spustitUklidRucne, pocatecniStav);

  return (
    <div>
      <form action={formAction}>
        <TlacitkoOdeslat />
      </form>
      {stav.zkontrolovano > 0 && (
        <p className="mt-3 text-sm text-paper">
          Zkontrolováno: {stav.zkontrolovano} · Smazáno událostí: {stav.smazanoUdalosti} · Smazáno příběhů:{" "}
          {stav.smazanoPribehu}
        </p>
      )}
    </div>
  );
}

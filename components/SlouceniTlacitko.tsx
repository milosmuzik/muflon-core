"use client";

import { useFormState, useFormStatus } from "react-dom";
import { spustitSlouceniRucne } from "@/lib/actions/kontrola";

const pocatecniStav = { skupinZkontrolovano: 0, smazanoDuplicit: 0 };

function TlacitkoOdeslat() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="bg-rust/10 border border-rust/50 text-rust rounded-sm px-3 py-1.5 hover:bg-rust/20 transition-colors focus-ring text-sm disabled:opacity-50"
    >
      {pending ? "Slučuji…" : "Sloučit duplicitní události"}
    </button>
  );
}

export default function SlouceniTlacitko() {
  const [stav, formAction] = useFormState(spustitSlouceniRucne, pocatecniStav);

  return (
    <div>
      <form action={formAction}>
        <TlacitkoOdeslat />
      </form>
      {stav.skupinZkontrolovano > 0 && (
        <p className="mt-3 text-sm text-paper">
          Zkontrolováno dnů s víc událostmi: {stav.skupinZkontrolovano} · Smazáno duplicit: {stav.smazanoDuplicit}
        </p>
      )}
    </div>
  );
}

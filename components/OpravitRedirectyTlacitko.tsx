"use client";

import { useFormState, useFormStatus } from "react-dom";
import { opravitGoogleRedirecty } from "@/lib/actions/kontrola";

const pocatecniStav = { zkontrolovano: 0, opraveno: 0, zvysenaDuvera: 0 };

function TlacitkoOdeslat() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring text-sm disabled:opacity-50"
    >
      {pending ? "Opravuji… (další dávka)" : "Opravit Google redirecty (další dávka)"}
    </button>
  );
}

export default function OpravitRedirectyTlacitko() {
  const [stav, formAction] = useFormState(opravitGoogleRedirecty, pocatecniStav);

  return (
    <div>
      <form action={formAction}>
        <TlacitkoOdeslat />
      </form>
      {stav.zkontrolovano > 0 && (
        <p className="mt-3 text-sm text-paper">
          Zkontrolováno v téhle dávce: {stav.zkontrolovano} · Opraveno URL: {stav.opraveno} · Zvýšena důvěra: {stav.zvysenaDuvera}
        </p>
      )}
    </div>
  );
}

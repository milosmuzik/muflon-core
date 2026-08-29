"use client";

import { useFormState, useFormStatus } from "react-dom";
import { spustitReviziRucne } from "@/lib/actions/agent";

const pocatecniStav = { opravenoZdroju: 0, zkontrolovanoUdalosti: 0, schvalenoNove: 0 };

function TlacitkoOdeslat() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring text-sm disabled:opacity-50"
    >
      {pending ? "Reviduji…" : "Zrevidovat všechny čekající události"}
    </button>
  );
}

export default function RevizeTlacitko() {
  const [stav, formAction] = useFormState(spustitReviziRucne, pocatecniStav);

  return (
    <div>
      <form action={formAction}>
        <TlacitkoOdeslat />
      </form>
      {(stav.zkontrolovanoUdalosti > 0 || stav.opravenoZdroju > 0) && (
        <p className="mt-3 text-sm text-paper">
          Zkontrolováno čekajících událostí: {stav.zkontrolovanoUdalosti} · Nově schváleno: {stav.schvalenoNove} ·
          Opraveno zdrojů: {stav.opravenoZdroju}
        </p>
      )}
    </div>
  );
}

"use client";

import { useFormState, useFormStatus } from "react-dom";
import { spustitReviziPribehuRucne } from "@/lib/actions/pribehy";

const pocatecniStav = { opravenoZdroju: 0, zkontrolovanoPribehu: 0, schvalenoNove: 0 };

function TlacitkoOdeslat() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring text-sm disabled:opacity-50"
    >
      {pending ? "Reviduji…" : "Zrevidovat všechny čekající příběhy"}
    </button>
  );
}

export default function RevizePribehyTlacitko() {
  const [stav, formAction] = useFormState(spustitReviziPribehuRucne, pocatecniStav);

  return (
    <div>
      <form action={formAction}>
        <TlacitkoOdeslat />
      </form>
      {(stav.zkontrolovanoPribehu > 0 || stav.opravenoZdroju > 0) && (
        <p className="mt-3 text-sm text-paper">
          Zkontrolováno čekajících příběhů: {stav.zkontrolovanoPribehu} · Nově schváleno: {stav.schvalenoNove} ·
          Opraveno zdrojů: {stav.opravenoZdroju}
        </p>
      )}
    </div>
  );
}

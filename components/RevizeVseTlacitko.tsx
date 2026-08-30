"use client";

import { useFormState, useFormStatus } from "react-dom";
import { spustitReviziVseRucne } from "@/lib/actions/kontrola";

const pocatecniStav = {
  zkontrolovano: 0,
  opravenoZdroju: 0,
  schvalenoNove: 0,
  posledniId: null as string | null,
  hotovo: false,
};

function TlacitkoOdeslat({ hotovo }: { hotovo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending || hotovo}
      className="bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring text-sm disabled:opacity-50"
    >
      {pending ? "Reviduji…" : hotovo ? "Hotovo – fronta je prázdná" : "Zrevidovat další dávku"}
    </button>
  );
}

export default function RevizeVseTlacitko() {
  const [stav, formAction] = useFormState(spustitReviziVseRucne, pocatecniStav);

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="kurzor" value={stav.posledniId ?? ""} />
        <TlacitkoOdeslat hotovo={stav.hotovo} />
      </form>
      {stav.zkontrolovano > 0 && (
        <p className="mt-3 text-sm text-paper">
          Zkontrolováno zdrojů: {stav.zkontrolovano} · Opraveno (URL/název/důvěra): {stav.opravenoZdroju} · Nově
          schváleno: {stav.schvalenoNove}
        </p>
      )}
    </div>
  );
}

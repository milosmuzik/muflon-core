"use client";

import { useFormState, useFormStatus } from "react-dom";
import { spustitAutomatickouReviziRucne } from "@/lib/actions/kontrola";

const pocatecniStav = {
  vracenoNaNavrh: 0,
  dohledano: 0,
  smazanoBezZdroje: 0,
  revidovanoZdroju: 0,
  schvaleno: 0,
  smazanoPoRevizi: 0,
  chyby: [] as string[],
};

function TlacitkoOdeslat() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring text-sm disabled:opacity-50"
    >
      {pending ? "Revize běží…" : "Spustit automatickou revizi"}
    </button>
  );
}

export default function AutomatickaRevizeTlacitko() {
  const [stav, formAction] = useFormState(spustitAutomatickouReviziRucne, pocatecniStav);

  const probehlo =
    stav.vracenoNaNavrh +
      stav.dohledano +
      stav.smazanoBezZdroje +
      stav.revidovanoZdroju +
      stav.schvaleno +
      stav.smazanoPoRevizi +
      stav.chyby.length >
    0;

  return (
    <div>
      <form action={formAction}>
        <TlacitkoOdeslat />
      </form>
      {probehlo && (
        <p className="mt-3 text-sm text-paper">
          Vráceno na návrh: {stav.vracenoNaNavrh} · Dohledáno zdrojů: {stav.dohledano} · Schváleno:{" "}
          {stav.schvaleno} · Smazáno bez zdroje: {stav.smazanoBezZdroje} · Smazáno po revizi: {stav.smazanoPoRevizi}
        </p>
      )}
      {stav.chyby.length > 0 && (
        <ul className="mt-2 text-xs text-rust space-y-1">
          {stav.chyby.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

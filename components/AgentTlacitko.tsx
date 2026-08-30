"use client";

import { useFormState, useFormStatus } from "react-dom";
import { spustitAgentaRucne } from "@/lib/actions/agent";

const pocatecniStav = { zpracovanoDni: 0, navrzeno: 0, preskoceno: 0, bezDostatecnehoZdroje: 0, chyby: [] as string[] };

function TlacitkoOdeslat() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring text-sm disabled:opacity-50"
    >
      {pending ? "Vyhledávám… (může trvat i minutu)" : "Spustit agenta teď (příštích 7 dní)"}
    </button>
  );
}

export default function AgentTlacitko() {
  const [stav, formAction] = useFormState(spustitAgentaRucne, pocatecniStav);

  return (
    <div>
      <form action={formAction}>
        <TlacitkoOdeslat />
      </form>
      {stav.zpracovanoDni > 0 && (
        <div className="mt-3 text-sm space-y-1">
          <p className="text-paper">
            Zpracováno dní: {stav.zpracovanoDni} · Navrženo (rovnou schváleno): {stav.navrzeno} · Přeskočeno
            (duplicity): {stav.preskoceno} · Bez dostatečného zdroje: {stav.bezDostatecnehoZdroje}
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

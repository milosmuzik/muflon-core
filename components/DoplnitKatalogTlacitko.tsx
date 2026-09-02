"use client";

import { useFormState, useFormStatus } from "react-dom";
import { spustitDoplneniKatalogu } from "@/lib/actions/kontrola";

const pocatek = { zpracovano: 0, doplneno: 0, zdroje: 0, polozky: [] as { typ: string; nazev: string; href: string; zmeny: string[]; zdroje: string[] }[], chyby: [] as string[] };

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
        <div className="mt-3 space-y-3">
          <p className="text-paper text-sm">
            Zpracováno {stav.zpracovano} · doplněno {stav.doplneno} · zdrojů +{stav.zdroje}
          </p>
          <ul className="space-y-2 text-sm">
            {stav.polozky.map((p) => (
              <li key={`${p.typ}:${p.href}`} className="border-b border-line/60 pb-2">
                <a href={p.href} className="text-accent hover:underline">
                  {p.typ === "Hudebnik" ? "Hudebník" : "Album"}: {p.nazev}
                </a>
                {p.zmeny.length === 0 && p.zdroje.length === 0 ? (
                  <p className="text-muted text-xs mt-0.5">Nic nového.</p>
                ) : (
                  <>
                    {p.zmeny.map((z) => (
                      <p key={z} className="text-paper text-xs mt-0.5">{z}</p>
                    ))}
                    {p.zdroje.map((z) => (
                      <p key={z} className="text-muted text-xs mt-0.5">zdroj: {z}</p>
                    ))}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {stav.chyby.length > 0 && (
        <ul className="text-rust text-xs mt-2">
          {stav.chyby.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

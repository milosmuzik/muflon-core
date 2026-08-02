"use client";

import { useFormState, useFormStatus } from "react-dom";
import { importovatKartu, type VysledekImportu } from "@/lib/actions/import";
import Link from "next/link";

const pocatecniStav: VysledekImportu = {
  chyba: null, interpretNazev: null, interpretId: null,
  novyChlenu: 0, novaAlba: 0, noveUdalosti: 0, novePribehy: 0, noveZdroje: 0,
  urovenKarty: null, rozpory: [], varovaniHudebnici: [],
};

function TlacitkoOdeslat() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-2 hover:bg-accentDim/50 transition-colors focus-ring disabled:opacity-50"
    >
      {pending ? "Zpracovávám kartu… (může trvat i minutu)" : "Zpracovat a uložit"}
    </button>
  );
}

export default function ImportKartyFormular() {
  const [stav, formAction] = useFormState(importovatKartu, pocatecniStav);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3">
        <textarea
          name="text"
          required
          rows={16}
          placeholder="Vlož sem text referenční karty přesně tak, jak ho dostaneš…"
          className="w-full bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring text-sm font-mono"
        />
        <TlacitkoOdeslat />
      </form>

      {stav.chyba && <p className="text-rust text-sm">{stav.chyba}</p>}

      {stav.interpretNazev && (
        <div className="index-card p-4 pl-6 text-sm space-y-2 border-sage/40">
          <p className="text-sage font-mono text-xs flex items-center gap-1.5">
            <span>✅</span> Zpracování dokončeno bez chyb — zapsáno do Muflon Core
          </p>
          <p className="text-paper">
            <Link href={`/interpreti/${stav.interpretId}`} className="text-accent hover:underline">
              {stav.interpretNazev}
            </Link>{" "}
            — {stav.urovenKarty === "referencni" ? "⭐ referenční karta" : "uloženo jako návrh (chybí URL u zdrojů)"}
          </p>
          <p className="text-muted text-xs font-mono">
            +{stav.novyChlenu} členů · +{stav.novaAlba} alb · +{stav.noveUdalosti} událostí · +{stav.novePribehy} příběhů · +{stav.noveZdroje} zdrojů
          </p>

          {stav.rozpory.length > 0 && (
            <div>
              <p className="text-accent text-xs font-mono mb-1">Rozpory nalezené AI:</p>
              <ul className="text-muted text-xs space-y-0.5 list-disc list-inside">
                {stav.rozpory.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {stav.varovaniHudebnici.length > 0 && (
            <div>
              <p className="text-rust text-xs font-mono mb-1">
                Pozor — jméno už existuje u jiné kapely (zkontroluj, jestli je to stejná osoba):
              </p>
              <ul className="text-muted text-xs space-y-0.5 list-disc list-inside">
                {stav.varovaniHudebnici.map((jmeno, i) => (
                  <li key={i}>{jmeno}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

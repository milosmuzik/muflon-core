"use client";

export default function KontrolaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-3">
      <h1 className="font-display text-2xl text-paper">Kontrola kvality – chyba</h1>
      <p className="text-rust text-sm">Stránka spadla. Detail níž pomůže s opravou.</p>
      <pre className="text-xs text-muted bg-raised border border-line rounded-sm p-3 overflow-auto whitespace-pre-wrap">
        {error.message}
        {error.digest ? `\ndigest: ${error.digest}` : ""}
        {error.stack ? `\n\n${error.stack}` : ""}
      </pre>
      <button
        onClick={() => reset()}
        className="bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring text-sm"
      >
        Zkusit znovu
      </button>
    </div>
  );
}

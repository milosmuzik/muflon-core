import { prihlasit } from "@/lib/actions/auth";

export default function PrihlaseniPage({
  searchParams,
}: {
  searchParams: { dalsi?: string; chyba?: string };
}) {
  return (
    <div className="max-w-sm space-y-6">
      <div>
        <p className="tab-label mb-2">Přístup</p>
        <h1 className="font-display text-2xl text-paper">Přihlášení</h1>
      </div>
      <form action={prihlasit} className="space-y-3">
        <input type="hidden" name="dalsi" value={searchParams.dalsi || "/"} />
        <input
          type="password"
          name="heslo"
          required
          placeholder="Heslo"
          className="w-full bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring"
        />
        {searchParams.chyba && <p className="text-rust text-sm">Špatné heslo.</p>}
        <button className="bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-2 hover:bg-accentDim/50 focus-ring">
          Přihlásit
        </button>
      </form>
    </div>
  );
}

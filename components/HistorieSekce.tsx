import IndexCard from "./IndexCard";

type Zaznam = { id: string; akce: string; popis: string | null; createdAt: Date };

const AKCE_LABEL: Record<string, string> = {
  vytvoreno: "založeno",
  upraveno: "upraveno",
  smazano: "smazáno",
  zmena_stavu: "změna stavu",
};

export default function HistorieSekce({ zaznamy }: { zaznamy: Zaznam[] }) {
  if (zaznamy.length === 0) return null;
  return (
    <IndexCard label="Historie změn">
      <ul className="space-y-1.5 text-sm">
        {zaznamy.map((z) => (
          <li key={z.id} className="flex gap-3 text-muted">
            <span className="font-mono text-xs shrink-0 mt-0.5">
              {new Date(z.createdAt).toLocaleDateString("cs-CZ")}
            </span>
            <span>
              <span className="text-paper">{AKCE_LABEL[z.akce] ?? z.akce}</span>
              {z.popis ? ` — ${z.popis}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </IndexCard>
  );
}

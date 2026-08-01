import { STAV_BARVA, STAV_LABEL } from "@/lib/constants";

export default function StatusBadge({ stav }: { stav: string }) {
  const barva = STAV_BARVA[stav] ?? "bg-raised text-muted border-line";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-sm border text-xs font-mono uppercase tracking-wide ${barva}`}
    >
      {STAV_LABEL[stav] ?? stav}
    </span>
  );
}

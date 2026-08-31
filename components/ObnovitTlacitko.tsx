"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function ObnovitTlacitko() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [naposledy, setNaposledy] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => {
          startTransition(() => {
            router.refresh();
            setNaposledy(new Date().toLocaleTimeString("cs-CZ"));
          });
        }}
        disabled={pending}
        className="bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring text-sm disabled:opacity-50"
      >
        {pending ? "Obnovuji…" : "Obnovit"}
      </button>
      {naposledy && <span className="text-muted text-xs font-mono">naposledy obnoveno {naposledy}</span>}
    </div>
  );
}

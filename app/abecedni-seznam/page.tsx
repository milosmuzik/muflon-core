import { prisma } from "@/lib/prisma";
import IndexCard from "@/components/IndexCard";
import ObnovitTlacitko from "@/components/ObnovitTlacitko";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AbecedniSeznamPage() {
  const interpreti = await prisma.interpret.findMany({
    orderBy: { nazev: "asc" },
    select: { id: true, nazev: true, urovenKarty: true },
  });

  const hotovo = interpreti.filter((i) => i.urovenKarty === "referencni").length;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <h1 className="font-display text-2xl text-paper">Abecední seznam</h1>
        <span className="tab-label">
          {hotovo} / {interpreti.length} hotovo
        </span>
      </div>

      <ObnovitTlacitko />

      <IndexCard>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 text-sm">
          {interpreti.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 border-b border-line/40 py-1">
              <Link href={`/interpreti/${i.id}`} className="text-paper hover:text-accent truncate">
                {i.nazev}
              </Link>
              {i.urovenKarty === "referencni" && <span className="text-sage shrink-0">✓</span>}
            </li>
          ))}
        </ul>
      </IndexCard>
    </div>
  );
}

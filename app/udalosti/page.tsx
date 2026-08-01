import { prisma } from "@/lib/prisma";
import { vytvoritUdalost } from "@/lib/actions/udalosti";
import { prepnoutZverejneni } from "@/lib/actions/agent";
import AgentTlacitko from "@/components/AgentTlacitko";
import IndexCard from "@/components/IndexCard";
import StatusBadge from "@/components/StatusBadge";
import Link from "next/link";

const TYP_LABEL: Record<string, string> = {
  vyroci_alba: "Výročí alba",
  narozeniny: "Narozeniny",
  umrti: "Úmrtí",
  jina: "Jiná událost",
};

export default async function UdalostiPage({ searchParams }: { searchParams: { filtr?: string } }) {
  const jenAiNavrhy = searchParams.filtr === "ai";

  const udalosti = await prisma.udalost.findMany({
    where: jenAiNavrhy ? { zdrojAI: true, stav: "navrh" } : undefined,
    orderBy: { datum: "asc" },
  });
  const pocetAiKZpracovani = await prisma.udalost.count({ where: { zdrojAI: true, stav: "navrh" } });

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl text-paper">Události</h1>
        <span className="tab-label">{udalosti.length} záznamů</span>
      </div>

      <IndexCard label="AI agent · návrhy do kalendáře">
        <p className="text-muted text-sm mb-3">
          Jednou denně (plánovač na Vercelu) agent projede příštích 7 dní a navrhne výročí a zajímavosti se zdroji.
          Můžeš ho i spustit ručně:
        </p>
        <AgentTlacitko />
        {pocetAiKZpracovani > 0 && (
          <p className="text-muted text-xs mt-3">
            <Link href="/udalosti?filtr=ai" className="text-accent hover:underline">
              {pocetAiKZpracovani} AI návrhů čeká na tvé rozhodnutí →
            </Link>
          </p>
        )}
      </IndexCard>

      <div className="flex gap-2 text-xs font-mono">
        <Link href="/udalosti" className={`px-2 py-1 rounded-sm border ${!jenAiNavrhy ? "border-accent text-accent" : "border-line text-muted"}`}>
          vše
        </Link>
        <Link href="/udalosti?filtr=ai" className={`px-2 py-1 rounded-sm border ${jenAiNavrhy ? "border-accent text-accent" : "border-line text-muted"}`}>
          AI návrhy k výběru
        </Link>
      </div>

      <div className="index-card divide-y divide-line/60">
        {udalosti.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-4 px-5 py-2.5 pl-8 hover:bg-raised transition-colors">
            <Link href={`/udalosti/${u.id}`} className="min-w-0">
              <span className="text-paper text-sm">{u.nazev}</span>
              <span className="text-muted text-xs font-mono ml-2">{TYP_LABEL[u.typ] ?? u.typ} · {u.datum}</span>
              {u.zdrojAI && <span className="text-accent text-xs font-mono ml-2">AI návrh</span>}
            </Link>
            <div className="flex items-center gap-3 shrink-0">
              <form action={prepnoutZverejneni.bind(null, u.id, u.zverejnitNaSitich)}>
                <button
                  className={`text-xs font-mono px-2 py-1 rounded-sm border focus-ring ${
                    u.zverejnitNaSitich ? "border-sage/50 text-sage" : "border-line text-muted"
                  }`}
                  title="Zveřejnit na sociálních sítích"
                >
                  {u.zverejnitNaSitich ? "✓ na sítě" : "na sítě"}
                </button>
              </form>
              <StatusBadge stav={u.stav} />
            </div>
          </div>
        ))}
        {udalosti.length === 0 && <p className="text-muted text-sm px-5 py-4 pl-8">Nic v tomto filtru.</p>}
      </div>

      <IndexCard label="Založit novou událost / výročí">
        <form action={vytvoritUdalost} className="grid grid-cols-2 gap-3 text-sm">
          <input name="nazev" placeholder="Název" required className="col-span-2 bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <select name="typ" defaultValue="vyroci_alba" className="bg-ink border border-line rounded-sm px-3 py-2 text-paper focus-ring">
            <option value="vyroci_alba">Výročí alba</option>
            <option value="narozeniny">Narozeniny</option>
            <option value="umrti">Úmrtí</option>
            <option value="jina">Jiná událost</option>
          </select>
          <input name="datum" placeholder="Datum (YYYY-MM-DD nebo MM-DD)" required className="bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <label className="col-span-2 flex items-center gap-2 text-muted">
            <input type="checkbox" name="opakujeSe" defaultChecked /> každoročně se opakující výročí
          </label>
          <textarea name="popis" placeholder="Popis" rows={2} className="col-span-2 bg-ink border border-line rounded-sm px-3 py-2 text-paper placeholder:text-muted/70 focus-ring" />
          <button className="col-span-2 bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-2 hover:bg-accentDim/50 transition-colors focus-ring">
            Založit událost
          </button>
        </form>
      </IndexCard>
    </div>
  );
}

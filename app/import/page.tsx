import IndexCard from "@/components/IndexCard";
import ImportKartyFormular from "@/components/ImportKartyFormular";

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="tab-label mb-2">AI zpracování dat</p>
        <h1 className="font-display text-2xl text-paper">Import karty</h1>
        <p className="text-muted text-sm mt-1">
          Vlož text referenční karty přesně tak, jak ho dostaneš — appka si ji sama rozparsuje a zapíše.
          Bez skutečných URL u zdrojů zůstane karta jako "návrh".
        </p>
      </div>
      <IndexCard>
        <ImportKartyFormular />
      </IndexCard>
    </div>
  );
}

import { prisma } from "@/lib/prisma";
import IndexCard from "@/components/IndexCard";
import Link from "next/link";
import { sloucitSkupinu } from "@/lib/actions/slouceni";
import { vratitBezZdrojeNaNavrh } from "@/lib/actions/kontrola";
import DohledatZdrojeTlacitko from "@/components/DohledatZdrojeTlacitko";
import RevizeVseTlacitko from "@/components/RevizeVseTlacitko";
import UklidTlacitko from "@/components/UklidTlacitko";
import SlouceniTlacitko from "@/components/SlouceniTlacitko";
import {
  POZNAMKA_MB_CLENSTVI,
  POZNAMKA_AI_NAVRH_KALENDAR,
  POZNAMKA_AI_ROZSIRENI,
  POZNAMKA_DOHLEDANO,
  STAV_LABEL,
} from "@/lib/constants";

export const maxDuration = 60;

export default async function KontrolaPage() {
  const [
    interpretiVsichni,
    vsechnyZdroje,
    pribehyVsechny,
    pribehyZdroje,
    vazbyPribehInterpret,
    clenstviVsechny,
    udalostiNeoverene,
    udalostiVsechny,
    udalostiZdroje,
    pocetAiZdroju,
  ] = await Promise.all([
    prisma.interpret.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { alba: true, skladby: true, clenstvi: true } } },
    }),
    prisma.zdroj.findMany({ where: { cilovyTyp: "Interpret" }, select: { cilovyId: true } }),
    prisma.pribeh.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.zdroj.findMany({ where: { cilovyTyp: "Pribeh" }, select: { cilovyId: true } }),
    prisma.vazba.findMany({ where: { zdrojovyTyp: "Pribeh", cilovyTyp: "Interpret" }, select: { zdrojovyId: true } }),
    prisma.clenstvi.findMany({ include: { hudebnik: true } }),
    prisma.udalost.findMany({ where: { zdrojAI: false, stav: "navrh" }, orderBy: { createdAt: "asc" } }),
    prisma.udalost.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.zdroj.findMany({ where: { cilovyTyp: "Udalost" }, select: { cilovyId: true } }),
    prisma.zdroj.count({
      where: {
        cilovyTyp: { in: ["Udalost", "Pribeh"] },
        poznamka: { in: [POZNAMKA_AI_NAVRH_KALENDAR, POZNAMKA_AI_ROZSIRENI, POZNAMKA_DOHLEDANO] },
      },
    }),
  ]);

  const interpretIdSeZdrojem = new Set(vsechnyZdroje.map((z) => z.cilovyId));
  const referencniBezZdroju = interpretiVsichni.filter(
    (i) => i.urovenKarty === "referencni" && !interpretIdSeZdrojem.has(i.id)
  );

  const interpretiNavrh = interpretiVsichni.filter((i) => i.urovenKarty === "navrh").slice(0, 10);

  const pribehIdSeZdrojem = new Set(pribehyZdroje.map((z) => z.cilovyId));
  const pribehyBezZdroju = pribehyVsechny.filter((p) => !pribehIdSeZdrojem.has(p.id));

  const udalostIdSeZdrojem = new Set(udalostiZdroje.map((z) => z.cilovyId));
  const udalostiBezZdroje = udalostiVsechny.filter((u) => !udalostIdSeZdrojem.has(u.id));

  // Skutečný rozpor: záznam se tváří jako ověřený/schválený/publikovaný
  // (stav dál než "návrh"), ale nemá žádný zdroj. U "návrhu" je to v
  // pořádku – tam se zdroj teprve doplňuje.
  const pribehySchvaleneBezZdroju = pribehyBezZdroju.filter((p) => p.stav !== "navrh");
  const udalostiSchvaleneBezZdroju = udalostiBezZdroje.filter((u) => u.stav !== "navrh");

  const pribehIdSVazbou = new Set(vazbyPribehInterpret.map((v) => v.zdrojovyId));
  const pribehyBezInterpreta = pribehyVsechny.filter((p) => !pribehIdSVazbou.has(p.id));

  const interpretyPodleHudebnika = new Map<string, Set<string>>();
  for (const c of clenstviVsechny) {
    if (!interpretyPodleHudebnika.has(c.hudebnikId)) interpretyPodleHudebnika.set(c.hudebnikId, new Set());
    interpretyPodleHudebnika.get(c.hudebnikId)!.add(c.interpretId);
  }
  const podezreliHudebnici = clenstviVsechny
    .filter((c, idx, arr) => arr.findIndex((x) => x.hudebnikId === c.hudebnikId) === idx)
    .map((c) => ({ id: c.hudebnikId, jmeno: c.hudebnik.jmeno, pocetKapel: interpretyPodleHudebnika.get(c.hudebnikId)?.size ?? 0 }))
    .filter((h) => h.pocetKapel >= 3)
    .sort((a, b) => b.pocetKapel - a.pocetKapel);

  const podleNazvu = new Map<string, typeof interpretiVsichni>();
  for (const i of interpretiVsichni) {
    const klic = i.nazev.trim().toLowerCase();
    if (!podleNazvu.has(klic)) podleNazvu.set(klic, []);
    podleNazvu.get(klic)!.push(i);
  }
  const duplicitniInterpreti = [...podleNazvu.values()].filter((v) => v.length > 1);

  // Sestavy doplněné dávkovým importem z MusicBrainz (prisma/enrich-hudebnici.ts)
  // – Interpret/Hudebník nemá redakční workflow jako příběhy/události, takže
  // tohle je jediné místo, kde se dá tenhle typ automaticky doplněných,
  // zatím lidsky nezkontrolovaných dat vůbec uvidět.
  const nazevInterpretaMapa = new Map(interpretiVsichni.map((i) => [i.id, i.nazev]));
  const interpretIdMbNezkontrolovano = new Set(
    clenstviVsechny.filter((c) => c.poznamka === POZNAMKA_MB_CLENSTVI).map((c) => c.interpretId)
  );
  const interpretiMbNezkontrolovano = [...interpretIdMbNezkontrolovano]
    .map((id) => ({ id, nazev: nazevInterpretaMapa.get(id) ?? "?" }))
    .sort((a, b) => a.nazev.localeCompare(b.nazev));

  const pocetProblemu =
    referencniBezZdroju.length + pribehyBezZdroju.length + pribehyBezInterpreta.length +
    podezreliHudebnici.length + duplicitniInterpreti.length + udalostiSchvaleneBezZdroju.length +
    interpretiMbNezkontrolovano.length;

  return (
    <div className="space-y-6">
      <div>
        <p className="tab-label mb-2">Automatická pojistka proti zaplevelení dat</p>
        <h1 className="font-display text-2xl text-paper">Kontrola kvality</h1>
        <p className="text-muted text-sm mt-1">
          {pocetProblemu === 0 ? "Žádné nalezené nesrovnalosti." : `${pocetProblemu} věcí k ruční kontrole.`}
        </p>
      </div>

      {(pribehySchvaleneBezZdroju.length > 0 || udalostiSchvaleneBezZdroju.length > 0) && (
        <IndexCard
          label={`🚨 Označeno jako ověřené/schválené, ale bez zdroje (${pribehySchvaleneBezZdroju.length + udalostiSchvaleneBezZdroju.length})`}
        >
          <p className="text-muted text-sm mb-3">
            Tyhle záznamy mají stav dál než „návrh" (viz štítek), ale v databázi u nich není žádný zdroj – to je
            přímý rozpor s principem „bez zdroje je údaj jen tvrzením, ne ověřenou znalostí" (kap. 4.4
            Ověřitelnost). Většinou pocházejí ze starého importu karet, který stav nastavoval napevno. Oprava je
            vrátí na „návrh" – zůstanou v databázi, jen přestanou tvrdit něco, co nemají čím podložit.
          </p>
          <form action={vratitBezZdrojeNaNavrh} className="mb-4">
            <button className="bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring text-sm">
              Vrátit všechny na „Návrh"
            </button>
          </form>
          {pribehySchvaleneBezZdroju.length > 0 && (
            <div className="mb-3">
              <p className="tab-label mb-1.5">Příběhy ({pribehySchvaleneBezZdroju.length})</p>
              <ul className="space-y-1">
                {pribehySchvaleneBezZdroju.map((p) => (
                  <li key={p.id} className="text-sm">
                    <Link href={`/pribehy/${p.id}`} className="text-paper hover:text-accent">{p.nadpis}</Link>
                    <span className="text-muted text-xs font-mono ml-2">{STAV_LABEL[p.stav] ?? p.stav}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {udalostiSchvaleneBezZdroju.length > 0 && (
            <div>
              <p className="tab-label mb-1.5">Události ({udalostiSchvaleneBezZdroju.length})</p>
              <ul className="space-y-1">
                {udalostiSchvaleneBezZdroju.map((u) => (
                  <li key={u.id} className="text-sm">
                    <Link href={`/udalosti/${u.id}`} className="text-paper hover:text-accent">{u.nazev}</Link>
                    <span className="text-muted text-xs font-mono ml-2">{STAV_LABEL[u.stav] ?? u.stav}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </IndexCard>
      )}

      <IndexCard label={`⚠ Referenční karty bez zdroje (${referencniBezZdroju.length})`}>
        {referencniBezZdroju.length === 0 ? (
          <p className="text-muted text-sm">V pořádku - všechny referenční karty mají alespoň jeden zdroj.</p>
        ) : (
          <ul className="space-y-1.5">
            {referencniBezZdroju.map((i) => (
              <li key={i.id}>
                <Link href={`/interpreti/${i.id}`} className="text-sm text-paper hover:text-accent">{i.nazev}</Link>
                <span className="text-rust text-xs font-mono ml-2">označeno ⭐ referenční, ale bez zdroje</span>
              </li>
            ))}
          </ul>
        )}
      </IndexCard>

      <IndexCard label={`👥 Hudebníci hraní ve 3+ kapelách (${podezreliHudebnici.length})`}>
        <p className="text-muted text-xs mb-3">Může jít o skutečné hostující/session hudebníky, nebo o omylem spojené dvě různé osoby se stejným jménem. Zkontroluj ručně.</p>
        {podezreliHudebnici.length === 0 ? (
          <p className="text-muted text-sm">Žádní takoví.</p>
        ) : (
          <ul className="space-y-1.5">
            {podezreliHudebnici.map((h) => (
              <li key={h.id}>
                <Link href={`/hudebnici/${h.id}`} className="text-sm text-paper hover:text-accent">{h.jmeno}</Link>
                <span className="text-muted text-xs font-mono ml-2">{h.pocetKapel} různých interpretů</span>
              </li>
            ))}
          </ul>
        )}
      </IndexCard>

      <IndexCard label={`🤖 Sestavy doplněné z MusicBrainz, nezkontrolováno (${interpretiMbNezkontrolovano.length})`}>
        <p className="text-muted text-xs mb-3">
          Dávkový import (<code>npm run enrich:hudebnici</code>) doplnil členy kapely automaticky z MusicBrainz –
          obecné databáze mimo redakční whitelist, sama o sobě nestačí jako ověřený zdroj. Projdi a potvrď ručně.
        </p>
        {interpretiMbNezkontrolovano.length === 0 ? (
          <p className="text-muted text-sm">Žádné nezkontrolované automatické sestavy.</p>
        ) : (
          <ul className="space-y-1.5">
            {interpretiMbNezkontrolovano.map((i) => (
              <li key={i.id}>
                <Link href={`/interpreti/${i.id}`} className="text-sm text-paper hover:text-accent">{i.nazev}</Link>
              </li>
            ))}
          </ul>
        )}
      </IndexCard>

      <IndexCard label={`🎭 Možní duplicitní interpreti (${duplicitniInterpreti.length})`}>
        {duplicitniInterpreti.length === 0 ? (
          <p className="text-muted text-sm">Žádné shodné názvy.</p>
        ) : (
          <div className="space-y-5">
            {duplicitniInterpreti.map((skupina, idx) => {
              const bohatstvi = (i: (typeof skupina)[number]) => i._count.alba + i._count.skladby + i._count.clenstvi;
              const serazena = [...skupina].sort((a, b) => bohatstvi(b) - bohatstvi(a));
              return (
                <form key={idx} action={sloucitSkupinu} className="border-b border-line/60 pb-4 last:border-0">
                  <p className="text-muted text-xs font-mono mb-2">Vyber, který záznam zůstane:</p>
                  <div className="space-y-1.5 mb-3">
                    {serazena.map((i, j) => (
                      <label key={i.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" name="keep" value={i.id} defaultChecked={j === 0} className="accent-accent" />
                        <input type="hidden" name="vsechna" value={i.id} />
                        <Link href={`/interpreti/${i.id}`} className="text-paper hover:text-accent">
                          {i.nazev}
                        </Link>
                        <span className="text-muted text-xs font-mono">
                          {i._count.alba} alb · {i._count.skladby} skladeb · {i._count.clenstvi} členů
                          {i.urovenKarty === "referencni" ? " · ⭐ referenční" : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                  <button className="text-xs bg-accentDim/30 border border-accent/40 text-accent rounded-sm px-3 py-1.5 hover:bg-accentDim/50 transition-colors focus-ring">
                    Sloučit do vybraného
                  </button>
                </form>
              );
            })}
          </div>
        )}
      </IndexCard>

      <IndexCard label="🔍 Dohledat zdroje (AI fact-checker)">
        <p className="text-muted text-sm mb-3">
          Projede příběhy a události bez zdroje a přes web search jim zkusí najít oficiální kanál interpreta nebo
          článek na renomovaném rockovém/metalovém serveru (viz whitelist v kódu). Zpracovává po dávkách kvůli
          limitu funkce – klikni víckrát, dokud fronta neubude. Co nenajde, nechá ve stavu „návrh".
        </p>
        <DohledatZdrojeTlacitko />
      </IndexCard>

      <IndexCard label={`🔄 Revize databáze – zdroje od AI agentů (${pocetAiZdroju})`}>
        <p className="text-muted text-sm mb-3">
          Jedno tlačítko pro všechno naráz, příběhy i události: rozbalí uložený Google redirect na skutečnou URL,
          opraví zobrazovaný název zdroje podle skutečné domény (ne podle toho, co si AI vymyslela), přepočítá důvěru
          a rovnou schválí, co teď má dostatečně důvěryhodný zdroj. Postupuje dávkami – klikej, dokud nenapíše
          „Hotovo".
        </p>
        <RevizeVseTlacitko />
      </IndexCard>

      <IndexCard label="🗑 Nevratně smazat nekvalifikované">
        <p className="text-muted text-sm mb-3">
          Příběhy a události, které prošly revizí výše, ale zdroj od AI agenta stále nestačí na schválení. Nikdo je
          ručně nereviduje, takže dál jen zabírají místo bez šance na schválení. Spustí se jednorázově celé, ne po
          dávkách. <strong>Nevratné.</strong>
        </p>
        <UklidTlacitko />
      </IndexCard>

      <IndexCard label="🧬 Sloučit duplicitní události">
        <p className="text-muted text-sm mb-3">
          Stejná událost popsaná AI agentem dvakrát jinými slovy (starší kontrola porovnávala jen prvních 20 znaků
          názvu, teď se srovnávají podstatná slova). Ponechá tu s lepším stavem/víc zdroji, zbytek smaže.{" "}
          <strong>Nevratné.</strong>
        </p>
        <SlouceniTlacitko />
      </IndexCard>

      <IndexCard label={`📖 Příběhy bez zdroje (${pribehyBezZdroju.length})`}>
        {pribehyBezZdroju.length === 0 ? (
          <p className="text-muted text-sm">Všechny příběhy mají alespoň jeden zdroj.</p>
        ) : (
          <ul className="space-y-1.5">
            {pribehyBezZdroju.map((p) => (
              <li key={p.id}>
                <Link href={`/pribehy/${p.id}`} className="text-sm text-paper hover:text-accent">{p.nadpis}</Link>
              </li>
            ))}
          </ul>
        )}
      </IndexCard>

      <IndexCard label={`🔗 Příběhy bez propojení na interpreta (${pribehyBezInterpreta.length})`}>
        {pribehyBezInterpreta.length === 0 ? (
          <p className="text-muted text-sm">Všechny příběhy jsou propojené.</p>
        ) : (
          <ul className="space-y-1.5">
            {pribehyBezInterpreta.map((p) => (
              <li key={p.id}>
                <Link href={`/pribehy/${p.id}`} className="text-sm text-paper hover:text-accent">{p.nadpis}</Link>
              </li>
            ))}
          </ul>
        )}
      </IndexCard>

      <IndexCard label={`📝 Interpreti čekající na dokončení karty (${interpretiNavrh.length})`}>
        {interpretiNavrh.length === 0 ? (
          <p className="text-muted text-sm">Žádní ve stavu "návrh".</p>
        ) : (
          <ul className="space-y-1.5">
            {interpretiNavrh.map((i) => (
              <li key={i.id}>
                <Link href={`/interpreti/${i.id}`} className="text-sm text-paper hover:text-accent">{i.nazev}</Link>
                <span className="text-muted text-xs font-mono ml-2">{new Date(i.createdAt).toLocaleDateString("cs-CZ")}</span>
              </li>
            ))}
          </ul>
        )}
      </IndexCard>

      {udalostiNeoverene.length > 0 && (
        <IndexCard label={`🗓 Ručně založené události ve stavu návrh (${udalostiNeoverene.length})`}>
          <ul className="space-y-1.5">
            {udalostiNeoverene.map((u) => (
              <li key={u.id}>
                <Link href={`/udalosti/${u.id}`} className="text-sm text-paper hover:text-accent">{u.nazev}</Link>
              </li>
            ))}
          </ul>
        </IndexCard>
      )}
    </div>
  );
}

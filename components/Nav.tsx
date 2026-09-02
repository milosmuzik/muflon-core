import Link from "next/link";
import { odhlasit } from "@/lib/actions/auth";

const POLOZKY = [
  { href: "/", label: "Přehled" },
  { href: "/interpreti", label: "Interpreti" },
  { href: "/abecedni-seznam", label: "Abecední seznam" },
  { href: "/hudebnici", label: "Hudebníci" },
  { href: "/alba", label: "Alba" },
  { href: "/skladby", label: "Skladby" },
  { href: "/pribehy", label: "Příběhy" },
  { href: "/udalosti", label: "Události" },
  { href: "/kalendar", label: "Kalendář" },
  { href: "/hledat", label: "Hledat" },
  { href: "/kontrola", label: "Kontrola" },
];

export default function Nav() {
  return (
    <header className="border-b border-line bg-ink/95 sticky top-0 z-10 backdrop-blur">
      <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-baseline gap-2 focus-ring">
          <span className="font-display text-xl text-paper">Muflon Core</span>
          <span className="tab-label">znalostní síť</span>
        </Link>
        <nav className="flex flex-wrap gap-1 text-sm items-center">
          {POLOZKY.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="px-3 py-1.5 rounded-sm text-muted hover:text-paper hover:bg-raised transition-colors focus-ring"
            >
              {p.label}
            </Link>
          ))}
          {process.env.AUTH_PASSWORD ? (
            <form action={odhlasit}>
              <button className="px-3 py-1.5 rounded-sm text-muted hover:text-paper hover:bg-raised transition-colors focus-ring">
                Odhlásit
              </button>
            </form>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

import Link from "next/link";
import { site } from "@/content/site";

/** tone="light" — білий текст поверх темного першого екрана */
export function Header({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <header className="header" style={{ color: tone === "light" ? "#fff" : "var(--bordeaux)" }}>
      <div className="wrap header__inner">
        <Link href="/" className="header__brand" aria-label={`${site.person} — головна`}>
          {site.brand}
        </Link>
        <nav className="header__nav" aria-label="Основна навігація">
          <Link href="/#formaty" className="hide-m">
            Послуги
          </Link>
          <Link href="/#faq" className="hide-m">
            Запитання
          </Link>
          <Link href="/booking" className="header__book">
            Забронювати
          </Link>
        </nav>
      </div>
    </header>
  );
}

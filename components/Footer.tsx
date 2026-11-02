import Link from "next/link";
import { site } from "@/content/site";
import { services } from "@/content/services";

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__grid">
          <div>
            <div className="footer__brand">{site.brand}</div>
            <p style={{ color: "var(--grey-2)", maxWidth: "26em", margin: 0 }}>
              {site.person}. Особистий бренд, контент, медійність та монетизація.
            </p>
          </div>
          <ul aria-label="Послуги">
            {services.map((s) => (
              <li key={s.slug}>
                <Link href={`/poslugy/${s.slug}`}>{s.name}</Link>
              </li>
            ))}
            <li>
            </li>
          </ul>
          <ul aria-label="Контакти та документи">
            <li>
              <a href={site.instagram} target="_blank" rel="noopener noreferrer">
                Instagram {site.instagramHandle}
              </a>
            </li>
            <li>
              <a href={site.telegramContact} target="_blank" rel="noopener noreferrer">
                Telegram
              </a>
            </li>
            <li>
              <Link href="/oferta">Публічна оферта</Link>
            </li>
            <li>
              <Link href="/privacy">Політика конфіденційності</Link>
            </li>
          </ul>
        </div>
        <div className="footer__legal">
          {site.legal.entity}. {site.legal.email}. Умови — в <Link href="/oferta">оферті</Link>.
          <br />
          Оплата карткою Visa / Mastercard, Apple Pay, Google Pay через WayForPay.
        </div>
      </div>
    </footer>
  );
}

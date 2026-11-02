"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";

/**
 * Липка кнопка на мобільному. З'являється, коли перший екран прокручено,
 * і ховається, коли на екрані вже є інша кнопка бронювання (елементи з data-cta),
 * тож не дублює і не перекриває основні заклики. Під неї у футері зарезервовано місце.
 */
export function StickyCta({
  href,
  label,
  title,
  sub,
  service,
  watch = "[data-hero]",
}: {
  href: string;
  label: string;
  title?: string;
  sub?: string;
  service?: string;
  watch?: string;
}) {
  const [pastHero, setPastHero] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(false);

  useEffect(() => {
    const hero = document.querySelector(watch);
    const ctas = Array.from(document.querySelectorAll("[data-cta]"));
    const visible = new Set<Element>();

    const heroObs = hero
      ? new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 })
      : null;
    if (hero) heroObs!.observe(hero);
    else setPastHero(true);

    const ctaObs = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
      setCtaVisible(visible.size > 0);
    });
    ctas.forEach((c) => ctaObs.observe(c));

    return () => {
      heroObs?.disconnect();
      ctaObs.disconnect();
    };
  }, [watch]);

  const show = pastHero && !ctaVisible;

  return (
    <div className={`sticky-cta${title ? "" : " sticky-cta--full"}`} data-visible={show} aria-hidden={!show}>
      <div className="sticky-cta__row">
        {title && (
          <div className="sticky-cta__info">
            <b>{title}</b>
            {sub}
          </div>
        )}
        <Link
          href={href}
          className="btn"
          tabIndex={show ? 0 : -1}
          onClick={() => track("service_click", { service, location: "sticky" })}
        >
          {label}
        </Link>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { services, getService } from "@/content/services";
import { site } from "@/content/site";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { StickyCta } from "@/components/StickyCta";
import { TrackLink } from "@/components/TrackLink";
import { ViewTracker } from "@/components/ViewTracker";

export const revalidate = 21600;

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = getService((await params).slug);
  if (!s) return {};
  return { title: `${s.title} — ${s.priceEur} €`, description: s.lead };
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const s = getService((await params).slug);
  if (!s) notFound();
  const others = services.filter((x) => x.slug !== s.slug);
  const bookHref = `/booking?service=${s.slug}`;

  return (
    <>
      <Header tone="light" />
      <ViewTracker service={s.slug} />
      <main>
        <section className="svc-hero" data-hero style={{ backgroundImage: `url(${s.image.replace(".jpg", "-full.jpg")})` }}>
          <div className="wrap svc-hero__inner">
            <Link href="/#formaty" className="svc-hero__back">
              ← Усі формати
            </Link>
            <h1 className="display svc-hero__title">{s.title}</h1>
            <ul className="svc-hero__facts" aria-label="Коротко">
              <li className="chip chip--glass">
                {s.priceEur} €
              </li>
              <li className="chip chip--glass">{s.durationLabel}</li>
              <li className="chip chip--glass">{s.formatLabel}</li>
            </ul>
            <p className="lead">{s.lead}</p>
            <div className="svc-hero__actions">
              <TrackLink href={bookHref} className="btn btn--milk" service={s.slug} location="service-hero" cta>
                {s.cta}
              </TrackLink>
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <div className="wrap svc-body">
            <div>
              <h2 className="h3" style={{ marginBottom: 20 }}>
                {s.forWhomTitle}
              </h2>
              <ul className="svc-list">
                {s.forWhom.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="h3" style={{ marginBottom: 20 }}>
                {s.includesTitle}
              </h2>
              <ul className="svc-list">
                {s.includes.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              {s.note && (
                <p className="small muted" style={{ marginTop: 16 }}>
                  {s.note}
                </p>
              )}
            </div>
            <div className="svc-result">
              <div>
                <span className="chip chip--glass">Результат</span>
                <p>{s.result}</p>
              </div>
              <TrackLink href={bookHref} className="btn btn--milk" service={s.slug} location="service-result" cta>
                {s.cta}
              </TrackLink>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <h2 className="h3" style={{ marginBottom: 12 }}>
              Інші формати
            </h2>
            <div className="svc-other">
              {others.map((o) => (
                <Link key={o.slug} href={`/poslugy/${o.slug}`}>
                  {o.name}
                  <span>
                    {o.priceEur} € / {o.durationLabel}
                  </span>
                </Link>
              ))}
            </div>
            <p className="small muted" style={{ marginTop: 32 }}>
              Час зустрічей — {site.timezoneLabel}. Оплата 100% під час бронювання. Суми в гривнях орієнтовні.{" "}
              Є питання?{" "}
              <a href={site.telegramContact} className="link" target="_blank" rel="noopener noreferrer">
                Напиши в Telegram
              </a>
            </p>
          </div>
        </section>
      </main>
      <Footer />
      <StickyCta href={bookHref} label="Забронювати" title={s.name} sub={`${s.priceEur} € / ${s.durationLabel}`} service={s.slug} />
    </>
  );
}

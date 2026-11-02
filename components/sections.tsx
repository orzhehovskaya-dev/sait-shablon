import Link from "next/link";
import { site, showPlaceholders, type Seg } from "@/content/site";
import { services, comparison } from "@/content/services";
import { Photo } from "./Photo";
import { TrackLink } from "./TrackLink";

/** Заголовок у стилі бренду: великі літери, приглушені частини, фото-капсули між словами */
export function Mixed({ segs, as: Tag = "h2", id, className = "" }: { segs: Seg[]; as?: "h1" | "h2" | "p"; id?: string; className?: string }) {
  return (
    <Tag className={`mixed ${className}`} id={id}>
      {segs.map((s, i) =>
        s.pill ? (
          <span className="pill-img" key={i} aria-hidden="true" style={{ backgroundImage: `url(${s.pill})` }} />
        ) : (
          <span key={i} className={s.muted ? "mixed__muted" : undefined}>
            {s.t}{" "}
          </span>
        ),
      )}
    </Tag>
  );
}

export function Star({ className = "" }: { className?: string }) {
  return (
    <span className={`star ${className}`} aria-hidden="true">
      ✱
    </span>
  );
}

export function Hero() {
  const h = site.hero;
  return (
    <section className="hero" data-hero>
      <div className="hero__media">
        <Photo photo={h.photo} priority sizes="100vw" />
      </div>
      <div className="wrap hero__inner">
        <div className="hero__main">
          <p className="hero__who">{h.who}</p>
          <h1 className="hero__title">
            {h.title.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h1>
          <p className="hero__sub">{h.subtitle}</p>
        </div>
        <div className="hero__bottom">
          <p className="hero__book">
            <Star /> {h.booking}
          </p>
          <div className="hero__cards">
            <TrackLink href="/booking" className="glass-card glass-card--light glass-card--cta" location="hero" cta>
              <span className="glass-card__label">{h.bookingLabel}</span>
              <b>{h.cta}</b>
              <span className="round-arrow" aria-hidden="true">↗</span>
            </TrackLink>
            <div className="glass-card">
              <span className="glass-card__label">{h.stat.text}</span>
              <b>{h.stat.value}</b>
            </div>
          </div>
          <ul className="hero__chips" aria-label="Послуги для бронювання">
            {services.map((s) => (
              <li key={s.slug}>
                <TrackLink href={`/booking?service=${s.slug}`} className="chip chip--glass hero__chip" service={s.slug} location="hero-chip">
                  {s.short} <span>{s.priceEur} €</span>
                </TrackLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function About() {
  const a = site.about;
  return (
    <section className="section" id="pro-mene" aria-labelledby="about-h">
      <div className="wrap">
        <div className="statement">
          <Star className="statement__star" />
          <div>
            <Mixed segs={a.heading} id="about-h" />
            {a.paragraphs.map((p) => (
              <p className="statement__text" key={p}>
                {p}
              </p>
            ))}
          </div>
        </div>

        <div className="about__row">
          <figure className="about__portrait">
            <Photo photo={a.photo} sizes="(min-width: 900px) 34vw, 100vw" />
          </figure>
          <div className="about__aside">
            <h3 className="label-link">{a.audienceHeading}</h3>
            <ul className="tag-list">
              {a.audience.map((x) => (
                <li key={x} className="chip">
                  {x}
                </li>
              ))}
            </ul>
            <TrackLink href="/booking" className="btn about__cta" location="about" cta>
              Забронювати зустріч
            </TrackLink>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Results() {
  const r = site.results;
  return (
    <section className="section results" aria-labelledby="results-h">
      <div className="wrap">
        <Mixed segs={r.heading} id="results-h" className="mixed--light" />
        <ul className="results__list">
          {r.items.map((it) => (
            <li className="results__item" key={it.text}>
              <span className="results__value">{it.value}</span>
              <span className="results__desc">
                <b>{it.unit}</b>
                {it.text}
              </span>
            </li>
          ))}
        </ul>
        <ul className="results__extra">
          {r.extra.map((x) => (
            <li key={x}>
              <Star /> {x}
            </li>
          ))}
        </ul>
        <p className="results__note">{r.note}</p>
      </div>
    </section>
  );
}

function Mark({ v }: { v: string | boolean }) {
  if (v === true) return <span className="compare__yes" aria-label="так">✓</span>;
  if (v === false) return <span className="compare__no" aria-label="ні">—</span>;
  return <>{v}</>;
}

export async function Formats() {
  const f = site.formats;
  return (
    <section className="section" id="formaty" aria-labelledby="formats-h">
      <div className="wrap">
        <div className="center-head">
          <Mixed segs={f.heading} id="formats-h" className="mixed--center" />
          <p className="center-head__lead">{f.lead}</p>
        </div>

        <ul className="svc-cards">
          {services.map((s, i) => (
            <li key={s.slug} className={`svc-card${i === 1 ? " svc-card--featured" : ""}`}>
              <Link href={`/poslugy/${s.slug}`} className="svc-card__link">
                <span className="svc-card__img" style={{ backgroundImage: `url(${s.image})` }} aria-hidden="true" />
                <span className="chip chip--glass svc-card__tag">
                  {s.durationLabel} / {s.formatLabel}
                </span>
                <span className="svc-card__body">
                  <span className="svc-card__name">{s.name}</span>
                  <span className="svc-card__price">
                    {s.priceEur} €
                  </span>
                  <span className="svc-card__lead">{s.chooseIf}</span>
                </span>
              </Link>
              <TrackLink href={`/booking?service=${s.slug}`} className="btn svc-card__cta" service={s.slug} location="formats" cta>
                {s.cta}
              </TrackLink>
            </li>
          ))}
        </ul>

        <div className="compare">
          <h3 className="compare__title">Порівняння форматів</h3>
          <div className="table-scroll">
            <table className="compare__table">
              <caption className="sr-only">Порівняння форматів роботи</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Параметр</span>
                  </th>
                  {services.map((s) => (
                    <th scope="col" key={s.slug}>
                      {s.name}
                      <small>{s.priceEur} €</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {row.values.map((v, i) => (
                      <td key={i}>
                        <Mark v={v} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td />
                  {services.map((s) => (
                    <td key={s.slug}>
                      <TrackLink href={`/booking?service=${s.slug}`} className="link" service={s.slug} location="compare">
                        Обрати
                      </TrackLink>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Problems() {
  const p = site.problems;
  return (
    <section className="section section--tight" aria-labelledby="problems-h">
      <div className="wrap problems">
        <Mixed segs={p.heading} id="problems-h" />
        <ul className="problems__list">
          {p.items.map((x) => (
            <li key={x}>
              <Star /> <span>{x}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Cases() {
  const c = site.cases;
  if (!c.items.length && !showPlaceholders) return null;
  return (
    <section className="section section--tight" id="kejsy" aria-labelledby="cases-h">
      <div className="wrap">
        <h2 className="mixed" id="cases-h">
          {c.heading}
        </h2>
        <div className="shots">
          {c.items.length
            ? c.items.map((it) => (
                <figure className="shot" key={it.client}>
                  <div className="shot__frame">
                    {it.screenshots[0] && <Photo photo={it.screenshots[0]} sizes="(min-width: 900px) 25vw, 72vw" />}
                  </div>
                  <figcaption>
                    <b>
                      {it.client}, {it.niche}
                    </b>
                    <span className="muted">{it.work}</span>
                    <br />
                    <span className="case__result">{it.result}</span>
                  </figcaption>
                </figure>
              ))
            : [1, 2, 3, 4].map((n) => (
                <figure className="shot" key={n}>
                  <div className="shot__frame shot__frame--empty">Місце для скриншота кейсу</div>
                  <figcaption>
                    <b>Ім'я клієнта, ніша</b>
                    <span className="muted">Що зробили і який результат</span>
                  </figcaption>
                </figure>
              ))}
        </div>
        {!c.items.length && (
          <p className="dev-note">
            Видно лише в режимі розробки. Додай кейси в content/site.ts → cases.items — тоді блок з'явиться на сайті.
          </p>
        )}
      </div>
    </section>
  );
}

export function Process() {
  const p = site.process;
  return (
    <section className="section section--tight" aria-labelledby="process-h">
      <div className="wrap">
        <h2 className="mixed" id="process-h">
          {p.heading}
        </h2>
        <ol className="steps">
          {p.steps.map((s) => (
            <li key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Reviews() {
  const r = site.reviews;
  if (!r.items.length && !showPlaceholders) return null;
  return (
    <section className="section section--tight" id="vidguky" aria-labelledby="reviews-h">
      <div className="wrap">
        <h2 className="mixed" id="reviews-h">
          {r.heading}
        </h2>
        <div className="shots">
          {r.items.length
            ? r.items.map((it, i) => (
                <figure className="shot" key={i}>
                  {it.screenshot ? (
                    <div className="shot__frame">
                      <Photo photo={it.screenshot} sizes="(min-width: 900px) 25vw, 72vw" />
                    </div>
                  ) : (
                    <blockquote className="review-text">{it.text}</blockquote>
                  )}
                  <figcaption>
                    <b>{it.client}</b>
                    {it.service && <span className="muted">{it.service}</span>}
                  </figcaption>
                </figure>
              ))
            : [1, 2, 3, 4].map((n) => (
                <figure className="shot" key={n}>
                  <div className="shot__frame shot__frame--empty">Місце для скриншота відгуку</div>
                </figure>
              ))}
        </div>
        {!r.items.length && <p className="dev-note">Видно лише в режимі розробки. Додай відгуки в content/site.ts → reviews.items.</p>}
      </div>
    </section>
  );
}

export function Faq() {
  const f = site.faq;
  return (
    <section className="section section--tight" id="faq" aria-labelledby="faq-h">
      <div className="wrap faq-layout">
        <h2 className="mixed" id="faq-h">
          {f.heading}
        </h2>
        <div className="faq">
          {f.items.map((it) => (
            <details key={it.q}>
              <summary>{it.q}</summary>
              <p>{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  const f = site.finalCta;
  return (
    <section className="section final" aria-labelledby="final-h">
      <div className="wrap">
        <Mixed segs={f.heading} id="final-h" className="mixed--center" />
        <div className="final__grid">
          <TrackLink href="/booking" className="glow-card" location="final" cta>
            <span className="glow-card__text">{f.text}</span>
            <span className="glow-card__cta">
              {f.cta} <span className="round-arrow round-arrow--light" aria-hidden="true">↗</span>
            </span>
          </TrackLink>
        </div>
        <div className="final__ask">
          <p>{f.question}</p>
          <a href={site.telegramContact} className="btn btn--ghost" target="_blank" rel="noopener noreferrer">
            {f.questionCta}
          </a>
        </div>
      </div>
    </section>
  );
}


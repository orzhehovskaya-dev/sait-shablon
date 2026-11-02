"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { services, getService, type Service } from "@/content/services";
import { emptyForm, validateForm, type BookingForm, type FieldErrors } from "@/lib/validation";
import { addDays, dateKey, partsInTz, weekdayOf, TZ } from "@/lib/time";
import { track } from "@/lib/analytics";
import { Field } from "./Field";
import { site } from "@/content/site";

type Slot = { start: string; end: string; time: string };
type Day = { date: string; slots: Slot[] };
type Step = 0 | 1 | 2;

const DRAFT_KEY = "site_booking_draft_v1";
const UTM_KEY = "site_utm_v1";
const WINDOW = 14;

const WD = ["", "пн", "вт", "ср", "чт", "пт", "сб", "нд"];

function monthName(dateStr: string) {
  const [y, m] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("uk-UA", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));
}

function longDate(iso: string) {
  return new Intl.DateTimeFormat("uk-UA", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}

function timeOf(iso: string) {
  const p = partsInTz(new Date(iso));
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function BookingFlow({ initialService, uahRate }: { initialService?: string; uahRate?: number }) {
  const preset = initialService ? getService(initialService) : undefined;
  const [service, setService] = useState<Service | undefined>(preset);
  const [step, setStep] = useState<Step>(preset ? 1 : 0);

  const today = useMemo(() => dateKey(new Date()), []);
  const [from, setFrom] = useState(today);
  const [days, setDays] = useState<Day[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState<BookingForm>(emptyForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const topRef = useRef<HTMLDivElement>(null);

  // чернетка анкети та UTM — щоб при повторній спробі не заповнювати все знову
  useEffect(() => {
    try {
      const d = sessionStorage.getItem(DRAFT_KEY);
      if (d) setForm({ ...emptyForm, ...JSON.parse(d), consent: false });
      const sp = new URLSearchParams(window.location.search);
      const utm: Record<string, string> = {};
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((k) => {
        const v = sp.get(k);
        if (v) utm[k] = v;
      });
      if (Object.keys(utm).length) sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const { consent: _c, ...rest } = form;
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(rest));
    } catch {
      /* ignore */
    }
  }, [form]);

  useEffect(() => {
    if (service) track("begin_booking", { service: service.slug, value: service.priceEur, currency: "EUR" });
  }, [service]);

  const load = useCallback(
    async (svc: Service, start: string, keepDate?: string | null) => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/availability?service=${svc.slug}&from=${start}&days=${WINDOW}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Не вдалося завантажити розклад");
        const list: Day[] = data.days;
        setDays(list);
        const keep = keepDate && list.find((d) => d.date === keepDate && d.slots.length);
        const first = keep ?? list.find((d) => d.slots.length);
        setDate(first ? first.date : null);
      } catch (e) {
        setDays(null);
        setLoadError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (service && step === 1) load(service, from, date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, from, step === 1]);

  const goto = (s: Step) => {
    setStep(s);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const chooseService = (s: Service) => {
    setService(s);
    setSlot(null);
    setDate(null);
    setDays(null);
    setFrom(today);
    const url = new URL(window.location.href);
    url.searchParams.set("service", s.slug);
    window.history.replaceState(null, "", url.toString());
    goto(1);
  };

  const chooseSlot = (s: Slot) => {
    setSlot(s);
    setNotice(null);
    track("select_slot", { service: service?.slug });
  };

  const set = <K extends keyof BookingForm>(k: K, v: BookingForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const pay = async () => {
    if (!service || !slot) return;
    const v = validateForm(form, { extended: service.extendedForm, stage: "contact" });
    if (!v.ok) {
      setErrors(v.errors);
      const first = Object.keys(v.errors)[0];
      document.getElementById(`f-${first}`)?.focus();
      return;
    }
    track("form_complete", { service: service.slug });
    setSubmitting(true);
    setSubmitError(null);
    try {
      let utm = null;
      try {
        utm = JSON.parse(sessionStorage.getItem(UTM_KEY) || "null");
      } catch {
        /* ignore */
      }
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: service.slug, start: slot.start, form: v.data, utm, company: honeypot }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setSlot(null);
        setNotice(data.error);
        setSubmitting(false);
        goto(1);
        load(service, from, date);
        return;
      }
      if (res.status === 422) {
        setErrors(data.fields || {});
        setSubmitting(false);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Не вдалося перейти до оплати");

      track("begin_checkout", { service: service.slug, value: service.priceEur, currency: "EUR" });
      try {
        sessionStorage.setItem("site_last_booking", data.token);
      } catch {
        /* ignore */
      }

      // Перехід на захищену платіжну сторінку WayForPay (POST-форма з підписаними полями)
      const f = document.createElement("form");
      f.method = "POST";
      f.action = data.payment.url;
      f.acceptCharset = "utf-8";
      for (const [k, val] of Object.entries(data.payment.fields as Record<string, string>)) {
        const i = document.createElement("input");
        i.type = "hidden";
        i.name = k;
        i.value = val;
        f.appendChild(i);
      }
      document.body.appendChild(f);
      f.submit();
    } catch (e) {
      setSubmitError((e as Error).message);
      setSubmitting(false);
    }
  };

  const currentDay = days?.find((d) => d.date === date);
  const lastAllowed = days && days.length < WINDOW; // сервер обрізав горизонт бронювання
  const stepLabels = ["Формат", "Дата і час", "Контакти й оплата"];

  return (
    <div className="wrap booking" ref={topRef}>
      <div className="booking__head">
        <Link href={service ? `/poslugy/${service.slug}` : "/"} className="svc-hero__back">
          ← Назад
        </Link>
        <h1 className="booking__title">{step === 0 ? "Обери формат" : service?.name}</h1>
        <div className="progress" aria-hidden="true">
          {stepLabels.map((l, i) => (
            <span key={l} data-on={i <= step} />
          ))}
        </div>
        <span className="booking__step-label">
          Крок {step + 1} з 3 — {stepLabels[step]}
        </span>
      </div>

      <div className="booking__layout">
        <div>
          {step === 0 && (
            <div className="pick">
              {services.map((s) => (
                <button key={s.slug} type="button" className="pick__item" aria-pressed={service?.slug === s.slug} onClick={() => chooseService(s)}>
                  <span className="pick__name">{s.name}</span>
                  <span className="pick__price">{s.priceEur} €</span>
                  <span className="pick__meta">
                    {s.durationLabel} / {s.formatLabel}
                  </span>
                </button>
              ))}
              <p className="small muted" style={{ margin: "8px 0 0" }}>
                Не знаєш, що обрати?{" "}
                <a href={site.telegramContact} className="link" target="_blank" rel="noopener noreferrer">
                  Напиши мені в Telegram
                </a>
              </p>
            </div>
          )}

          {step === 1 && service && (
            <div style={{ display: "grid", gap: 20 }}>
              {notice && <div className="notice">{notice}</div>}
              <div>
                <div className="days-nav">
                  <button type="button" onClick={() => setFrom(addDays(from, -WINDOW) < today ? today : addDays(from, -WINDOW))} disabled={from <= today || loading}>
                    Раніше
                  </button>
                  <p className="month-label">{monthName(from)}</p>
                  <button type="button" onClick={() => setFrom(addDays(from, WINDOW))} disabled={loading || Boolean(lastAllowed)}>
                    Далі
                  </button>
                </div>

                {loading && !days && (
                  <div className="days" aria-busy="true">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="skeleton" style={{ width: 68, height: 76, flex: "none" }} />
                    ))}
                  </div>
                )}

                {days && (
                  <div className="days" role="group" aria-label="Дата">
                    {days.map((d) => {
                      const n = Number(d.date.slice(8));
                      const free = d.slots.length > 0;
                      return (
                        <button
                          key={d.date}
                          type="button"
                          className="day"
                          disabled={!free}
                          aria-pressed={d.date === date}
                          aria-label={`${longDate(`${d.date}T12:00:00Z`)}${free ? `, вільних годин: ${d.slots.length}` : ", немає вільного часу"}`}
                          onClick={() => {
                            setDate(d.date);
                            setSlot(null);
                          }}
                        >
                          <small>{WD[weekdayOf(d.date)]}</small>
                          <b>{n}</b>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {loadError && (
                <div className="notice notice--error" role="alert">
                  {loadError}{" "}
                  <button type="button" className="text-btn" onClick={() => load(service, from, date)}>
                    Спробувати ще раз
                  </button>
                </div>
              )}

              {days && !loading && !days.some((d) => d.slots.length) && (
                <div className="notice">
                  На ці дати вільного часу немає.{" "}
                  {!lastAllowed ? (
                    <button type="button" className="text-btn" onClick={() => setFrom(addDays(from, WINDOW))}>
                      Подивитися наступні два тижні
                    </button>
                  ) : (
                    "Нові дати відкриваються поступово — заглянь трохи згодом."
                  )}
                </div>
              )}

              {currentDay && currentDay.slots.length > 0 && (
                <div>
                  <p style={{ margin: 0, fontWeight: 500 }}>{longDate(currentDay.slots[0].start)}</p>
                  <p className="small muted" style={{ margin: "2px 0 0" }}>
                    Час київський. Тривалість — {service.durationLabel}.
                  </p>
                  <div className="times" role="group" aria-label="Час">
                    {currentDay.slots.map((s) => (
                      <button key={s.start} type="button" className="time" aria-pressed={slot?.start === s.start} onClick={() => chooseSlot(s)}>
                        {s.time}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
                <button type="button" className="btn" disabled={!slot} onClick={() => goto(2)}>
                  Далі — контакти й оплата
                </button>
                {!preset && (
                  <button type="button" className="btn btn--ghost" onClick={() => goto(0)}>
                    Змінити формат
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 2 && service && slot && (
            <form className="form pay-box" onSubmit={(e) => { e.preventDefault(); pay(); }} noValidate>
              <fieldset>
                <legend>Контакти</legend>
                <Field id="fullName" label="Ім'я та прізвище" value={form.fullName} error={errors.fullName} onChange={(v) => set("fullName", v)} autoComplete="name" />
                <Field id="email" label="Email" type="email" value={form.email} error={errors.email} onChange={(v) => set("email", v)} autoComplete="email" inputMode="email" hint="Сюди прийде підтвердження і нагадування про зустріч" />
                <Field id="contact" label="Telegram або телефон" value={form.contact} error={errors.contact} onChange={(v) => set("contact", v)} placeholder="@username або +380…" />
                <Field id="instagram" label="Instagram" value={form.instagram} error={errors.instagram} onChange={(v) => set("instagram", v)} placeholder="@nickname або посилання" autoCapitalize="none" />
              </fieldset>

              <p className="small muted" style={{ margin: 0 }}>
                Запитання про твій запит і цілі — у короткій анкеті одразу після оплати.
              </p>

              <div className="hp" aria-hidden="true">
                <label htmlFor="company">Компанія</label>
                <input id="company" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
              </div>

              <Summary service={service} slot={slot} uahRate={uahRate} />

              <label className="check" htmlFor="f-consent">
                <input id="f-consent" type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} />
                <span>
                  Погоджуюсь на обробку персональних даних відповідно до{" "}
                  <Link href="/privacy" target="_blank" className="link">
                    політики конфіденційності
                  </Link>{" "}
                  та з умовами{" "}
                  <Link href="/oferta" target="_blank" className="link">
                    публічної оферти
                  </Link>
                  .
                </span>
              </label>
              {errors.consent && <span className="field__error">{errors.consent}</span>}
              {submitError && (
                <div className="notice notice--error" role="alert">
                  {submitError}
                </div>
              )}
              <button type="submit" className="btn btn--block" disabled={submitting || !form.consent}>
                {submitting ? "Переходимо до оплати…" : `Оплатити ${service.priceEur} €`}
              </button>
              <p className="small muted" style={{ margin: 0 }}>
                Відкриється захищена сторінка WayForPay: картка, Apple Pay або Google Pay. Час закріплюється за тобою, поки триває оплата.
              </p>
              <button type="button" className="text-btn" onClick={() => goto(1)}>
                Змінити дату чи час
              </button>
            </form>
          )}
        </div>

        {service && step > 0 && (
          <aside className={`booking__summary${step === 2 ? " booking__summary--pay" : ""}`}>
            <Summary service={service} slot={slot} uahRate={uahRate} />
          </aside>
        )}
      </div>
    </div>
  );
}

function Summary({ service, slot, uahRate }: { service: Service; slot: Slot | null; uahRate?: number }) {
  return (
    <div className="summary">
      <dl>
        <dt>Послуга</dt>
        <dd>{service.name}</dd>
        <dt>Тривалість</dt>
        <dd>{service.durationLabel}</dd>
        <dt>Формат</dt>
        <dd>{service.formatLabel}</dd>
        <dt>Дата</dt>
        <dd>{slot ? longDate(slot.start) : "—"}</dd>
        <dt>Час</dt>
        <dd>{slot ? `${timeOf(slot.start)} (Київ)` : "—"}</dd>
      </dl>
      <div className="summary__total">
        <span>
          До оплати
          <small style={{ display: "block", color: "var(--grey)" }}>оплата в гривнях за курсом НБУ</small>
        </span>
        <b>{service.priceEur} €</b>
      </div>
    </div>
  );
}

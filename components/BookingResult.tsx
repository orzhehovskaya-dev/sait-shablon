"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { track } from "@/lib/analytics";
import { site } from "@/content/site";
import { TZ } from "@/lib/time";
import { getService } from "@/content/services";
import { QuestionnaireForm } from "./QuestionnaireForm";

type Status = {
  status: "pending_payment" | "paid" | "failed" | "expired" | "cancelled" | "refunded" | "conflict";
  service: string;
  serviceName: string;
  startsAt: string;
  priceEur: number;
  email?: string;
  zoomReady: boolean;
  emailSent?: boolean;
  questionnaireDone?: boolean;
};

const POLL_MS = 3000;
const MAX_WAIT_MS = 120_000;

function when(iso: string) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("uk-UA", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
  const time = new Intl.DateTimeFormat("uk-UA", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  return `${date}, ${time} (Київ)`;
}

/** Показує СПРАВЖНІЙ статус із сервера — сторінка ніколи не «вирішує» сама, що оплата пройшла */
export function BookingResult({ token }: { token: string }) {
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const started = useRef(Date.now());

  useEffect(() => {
    if (!/^[a-f0-9]{48}$/.test(token)) {
      setError("Посилання некоректне. Якщо зустріч уже оплачено, перевір пошту або напиши мені.");
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    const tick = async () => {
      try {
        const res = await fetch(`/api/bookings/status?t=${token}&check=1`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Не вдалося отримати статус");
        if (stopped) return;
        setData(json);
        if (json.status === "pending_payment") {
          if (Date.now() - started.current > MAX_WAIT_MS) setWaitedTooLong(true);
          else timer = setTimeout(tick, POLL_MS);
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [token]);

  useEffect(() => {
    if (data?.status !== "paid") return;
    try {
      const key = `site_purchase_${token}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      sessionStorage.removeItem("site_booking_draft_v1");
    } catch {
      /* ignore */
    }
    track("purchase", { service: data.service, value: data.priceEur, currency: "EUR" });
  }, [data, token]);

  const retryHref = data ? `/booking?service=${data.service}` : "/booking";

  let title = "Перевіряємо оплату";
  let body: React.ReactNode = <p className="lead">Зачекай кілька секунд — отримуємо підтвердження від платіжної системи.</p>;
  let actions: React.ReactNode = null;

  if (error) {
    title = "Не вдалося перевірити статус";
    body = <p className="lead">{error}</p>;
    actions = (
      <>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Оновити сторінку
        </button>
        <a className="btn btn--ghost" href={site.telegramContact} target="_blank" rel="noopener noreferrer">
          Написати мені
        </a>
      </>
    );
  } else if (data) {
    switch (data.status) {
      case "paid":
        title = data.questionnaireDone ? "Зустріч заброньовано" : "Оплату отримано";
        body = (
          <>
            <p className="lead">
              {data.serviceName}, {when(data.startsAt)}.
            </p>
            <p className="muted">
              {data.emailSent
                ? `Підтвердження ${data.zoomReady ? "з посиланням на Zoom " : ""}надіслано на ${data.email}. Якщо листа немає за кілька хвилин, перевір «Спам» або «Промоакції». `
                : "Час закріплено за тобою — додай зустріч у свій календар кнопкою нижче. "}
              {data.zoomReady ? "" : "Посилання на Zoom я надішлю тобі особисто перед зустріччю. "}
              {data.emailSent ? "За добу до зустрічі прийде нагадування." : ""}
            </p>
            {!data.questionnaireDone ? (
              <div className="questionnaire-box">
                <h2 className="h3">Останній крок — коротка анкета</h2>
                <p className="muted">Розкажи про свій запит — я підготуюся до зустрічі заздалегідь. Займе 3–5 хвилин. Можна заповнити й пізніше за посиланням із листа.</p>
                <QuestionnaireForm
                  token={token}
                  serviceSlug={data.service}
                  extended={Boolean(getService(data.service)?.extendedForm)}
                  onDone={() => setData({ ...data, questionnaireDone: true })}
                />
              </div>
            ) : (
              <p className="notice">Анкету отримано. До зустрічі!</p>
            )}
          </>
        );
        actions = (
          <>
            <a className="btn" href={`/api/bookings/ics?t=${token}`}>
              Додати в календар
            </a>
            <Link className="btn btn--ghost" href="/">
              На головну
            </Link>
          </>
        );
        break;
      case "pending_payment":
        if (waitedTooLong) {
          title = "Оплата ще обробляється";
          body = (
            <p className="lead">
              Банк ще не підтвердив платіж. Щойно це станеться, на пошту прийде лист-підтвердження. Якщо гроші списано, а листа немає протягом години, напиши мені.
            </p>
          );
          actions = (
            <>
              <button type="button" className="btn" onClick={() => window.location.reload()}>
                Перевірити ще раз
              </button>
              <a className="btn btn--ghost" href={site.telegramContact} target="_blank" rel="noopener noreferrer">
                Написати мені
              </a>
            </>
          );
        }
        break;
      case "failed":
        title = "Оплату не завершено";
        body = <p className="lead">Платіж не пройшов, кошти не списано. Анкету збережено — можна спробувати ще раз або обрати інший час.</p>;
        actions = (
          <Link className="btn" href={retryHref}>
            Спробувати ще раз
          </Link>
        );
        break;
      case "expired":
        title = "Час на оплату минув";
        body = <p className="lead">Слот звільнено, бо оплату не завершено вчасно. Анкету збережено — обери час ще раз.</p>;
        actions = (
          <Link className="btn" href={retryHref}>
            Обрати час
          </Link>
        );
        break;
      case "conflict":
        title = "Оплату отримано";
        body = (
          <p className="lead">
            Але обраний час, на жаль, щойно став недоступним. Я вже отримала сповіщення і зв'яжуся з тобою, щоб запропонувати інший час або повернути кошти.
          </p>
        );
        break;
      case "cancelled":
      case "refunded":
        title = "Бронювання скасовано";
        body = <p className="lead">{data.status === "refunded" ? "Кошти повернуто на картку." : "Якщо маєш запитання — напиши мені."}</p>;
        actions = (
          <Link className="btn" href="/booking">
            Забронювати знову
          </Link>
        );
        break;
    }
  }

  const busy = !error && (!data || (data.status === "pending_payment" && !waitedTooLong));

  return (
    <section className="wrap result" aria-live="polite" aria-busy={busy}>
      <h1 className="result__title">{title}</h1>
      {body}
      {busy && <div className="skeleton" style={{ maxWidth: 320, height: 4, marginTop: 24 }} />}
      {actions && <div className="result__actions">{actions}</div>}
    </section>
  );
}

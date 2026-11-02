/**
 * Бізнес-логіка бронювання: доступність, утримання слота, обробка оплат,
 * виконання після оплати (календар, Zoom, листи, Telegram), повернення.
 */
import "server-only";
import { db } from "./supabase/admin.ts";
import { env } from "./env.ts";
import { getService, type Service } from "../content/services.ts";
import { site } from "../content/site.ts";
import { computeSlots, isSlotBookable, normalizeSettings, type AvailabilitySettings, type DaySlots, type Interval } from "./slots.ts";
import { addDays, dateKey, formatDateNumeric, timeKey, zonedToUtc, TZ } from "./time.ts";
import { getBusy, createEvent, deleteEvent } from "./caldav.ts";
import { buildIcs, googleCalendarUrl } from "./ics.ts";
import { createMeeting, deleteMeeting, zoomMode } from "./zoom.ts";
import { sendTelegram, escapeHtml, truncate } from "./telegram.ts";
import { sendEmail } from "./email.ts";
import { getEurUah } from "./fx.ts";
import { confirmationEmail, reminderEmail, cancellationEmail, type MailBooking } from "./email-templates.ts";
import type { BookingForm } from "./validation.ts";
import {
  buildPurchaseFields,
  checkStatus,
  refund as wfpRefund,
  PAID_STATUSES,
  FAILED_STATUSES,
  REFUND_STATUSES,
  WFP_PAY_URL,
  type WfpTransaction,
} from "./wayforpay.ts";

export type BookingStatus = "pending_payment" | "paid" | "failed" | "expired" | "cancelled" | "refunded" | "conflict";

export type BookingRow = {
  id: string;
  public_token: string;
  order_reference: string;
  service_slug: string;
  service_name: string;
  price_eur: number;
  charge_amount: number;
  charge_currency: string;
  starts_at: string;
  ends_at: string;
  buffer_min: number;
  blocked_until: string;
  status: BookingStatus;
  hold_expires_at: string;
  full_name: string;
  email: string;
  contact: string;
  instagram: string;
  occupation: string | null;
  main_request: string | null;
  desired_result: string | null;
  questions: string | null;
  questionnaire_at: string | null;
  socials: { tiktok?: string; youtube?: string; website?: string; other?: { label: string; url: string }[] };
  strategy: { products: string; averageCheck: string; acquisitionProblems: string; goal3m: string } | null;
  consent_at: string;
  utm: Record<string, string> | null;
  paid_at: string | null;
  payment_status: string | null;
  payment_system: string | null;
  card_pan: string | null;
  refunded_amount: number;
  refunded_at: string | null;
  cancelled_at: string | null;
  admin_note: string | null;
  calendar_event_url: string | null;
  zoom_meeting_id: string | null;
  zoom_join_url: string | null;
  confirmation_sent_at: string | null;
  owner_notified_at: string | null;
  reminder_sent_at: string | null;
  fulfilment_error: string | null;
  fulfilling_since: string | null;
  created_at: string;
  updated_at: string;
};

export class BookingError extends Error {
  constructor(
    public code: "slot_taken" | "invalid" | "calendar_unavailable" | "not_found" | "payment_config",
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Налаштування та доступність
// ---------------------------------------------------------------------------

export async function getSettings(): Promise<AvailabilitySettings> {
  const { data, error } = await db().from("availability_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return normalizeSettings(
    data
      ? {
          weeklyHours: data.weekly_hours,
          bufferMin: data.buffer_min,
          stepMin: data.step_min,
          minNoticeMin: data.min_notice_min,
          horizonDays: data.horizon_days,
        }
      : null,
  );
}

async function getBlockedDates(from: string, to: string): Promise<Set<string>> {
  const { data, error } = await db().from("blocked_dates").select("date").gte("date", from).lte("date", to);
  if (error) throw error;
  return new Set((data ?? []).map((r: { date: string }) => r.date));
}

/** Активні бронювання як зайнятий час (реальна тривалість зустрічі, перерва додається в розрахунку) */
async function getBookedIntervals(range: Interval): Promise<Interval[]> {
  await db().rpc("expire_stale_holds");
  const { data, error } = await db()
    .from("bookings")
    .select("starts_at, ends_at")
    .in("status", ["pending_payment", "paid"])
    .lt("starts_at", range.end.toISOString())
    .gt("ends_at", new Date(range.start.getTime() - 24 * 3600_000).toISOString());
  if (error) throw error;
  return (data ?? []).map((r: { starts_at: string; ends_at: string }) => ({ start: new Date(r.starts_at), end: new Date(r.ends_at) }));
}

async function busyFor(range: Interval, fresh: boolean): Promise<Interval[]> {
  let calendar: Interval[];
  try {
    calendar = await getBusy(range, { fresh });
  } catch (e) {
    console.error("[availability] calendar error", e);
    // Без календаря не можна гарантувати, що час вільний, тому слоти не показуємо взагалі
    throw new BookingError("calendar_unavailable", "Календар тимчасово недоступний. Спробуй за кілька хвилин.");
  }
  const booked = await getBookedIntervals(range);
  return [...calendar, ...booked];
}

export async function getAvailability(service: Service, fromDate: string, days: number, now = new Date()): Promise<DaySlots[]> {
  const settings = await getSettings();
  const today = dateKey(now, TZ);
  const from = fromDate < today ? today : fromDate;
  const to = addDays(from, days);
  const range = { start: zonedToUtc(from, "00:00"), end: zonedToUtc(to, "00:00") };
  const [blocked, busy] = await Promise.all([getBlockedDates(from, to), busyFor(range, false)]);
  return computeSlots({ settings, durationMin: service.durationMin, fromDate: from, days, blockedDates: blocked, busy, now });
}

// ---------------------------------------------------------------------------
// Створення бронювання (утримання слота) і платіж
// ---------------------------------------------------------------------------

function orderReference(): string {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  return `MG-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

export async function chargeFor(service: Service): Promise<{ amount: number; currency: string }> {
  const w = env.wayforpay();
  const rate = w.autoRate ? (await getEurUah()).rate : w.eurRate;
  // У гривнях округлюємо до цілих, щоб сума на платіжній сторінці виглядала акуратно
  const amount = w.currency === "UAH" ? Math.round(service.priceEur * rate) : Math.round(service.priceEur * rate * 100) / 100;
  return { amount, currency: w.currency };
}

export async function createBooking(input: {
  service: Service;
  startIso: string;
  form: BookingForm;
  utm?: Record<string, string> | null;
  now?: Date;
}): Promise<{ booking: BookingRow; payment: { url: string; fields: Record<string, string> } }> {
  const { service, form } = input;
  const now = input.now ?? new Date();
  const start = new Date(input.startIso);
  if (Number.isNaN(start.getTime())) throw new BookingError("invalid", "Некоректний час");

  let wfp;
  try {
    wfp = env.wayforpay();
  } catch {
    throw new BookingError("payment_config", "Оплата тимчасово недоступна");
  }

  // 1. Повторна перевірка слоту зі свіжими даними календаря — не довіряємо браузеру
  const settings = await getSettings();
  const date = dateKey(start, TZ);
  const range = { start: zonedToUtc(date, "00:00"), end: zonedToUtc(addDays(date, 1), "00:00") };
  const [blocked, busy] = await Promise.all([getBlockedDates(date, date), busyFor(range, true)]);
  if (!isSlotBookable(start, { settings, durationMin: service.durationMin, blockedDates: blocked, busy, now })) {
    throw new BookingError("slot_taken", "Цей час щойно зайняли. Обери інший, будь ласка.");
  }

  // 2. Утримання слота. Обмеження бази no_overlap не дасть двом людям забронювати один час одночасно.
  const holdMin = env.holdMinutes();
  const charge = await chargeFor(service);
  const end = new Date(start.getTime() + service.durationMin * 60000);
  const row = {
    order_reference: orderReference(),
    service_slug: service.slug,
    service_name: service.name,
    price_eur: service.priceEur,
    charge_amount: charge.amount,
    charge_currency: charge.currency,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    buffer_min: settings.bufferMin,
    blocked_until: new Date(end.getTime() + settings.bufferMin * 60000).toISOString(),
    status: "pending_payment",
    hold_expires_at: new Date(now.getTime() + holdMin * 60000).toISOString(),
    full_name: form.fullName,
    email: form.email,
    contact: form.contact,
    instagram: form.instagram,
    // анкету клієнт заповнює після оплати (див. saveQuestionnaire)
    consent_at: now.toISOString(),
    utm: input.utm ?? null,
  };

  const { data, error } = await db().from("bookings").insert(row).select("*").single();
  if (error) {
    if (error.code === "23P01") throw new BookingError("slot_taken", "Цей час щойно зайняли. Обери інший, будь ласка.");
    throw error;
  }
  const booking = data as BookingRow;

  // 3. Параметри платежу (підпис формується тут, на сервері)
  const [firstName, ...rest] = form.fullName.split(/\s+/);
  const site = env.siteUrl();
  const fields = buildPurchaseFields(
    { merchantAccount: wfp.merchantAccount, secretKey: wfp.secretKey, merchantDomainName: wfp.merchantDomainName },
    {
      orderReference: booking.order_reference,
      orderDate: Math.floor(now.getTime() / 1000),
      amount: booking.charge_amount,
      currency: booking.charge_currency,
      productName: `${service.name} — ${formatDateNumeric(start)} ${timeKey(start)}`,
      returnUrl: `${site}/api/wayforpay/return?t=${booking.public_token}`,
      serviceUrl: `${site}/api/wayforpay/callback`,
      clientFirstName: firstName,
      clientLastName: rest.join(" ") || undefined,
      clientEmail: form.email,
      orderTimeout: holdMin * 60,
    },
  );

  return { booking, payment: { url: WFP_PAY_URL, fields } };
}

// ---------------------------------------------------------------------------
// Обробка результату оплати (callback, CHECK_STATUS) — ідемпотентно
// ---------------------------------------------------------------------------

async function logPaymentEvent(tx: WfpTransaction, source: string, signatureValid: boolean) {
  const { cardPan, ...safe } = tx; // повний номер картки WayForPay не надсилає, але маску теж не дублюємо в журнал
  await db().from("payment_events").insert({
    order_reference: String(tx.orderReference ?? ""),
    source,
    transaction_status: tx.transactionStatus ?? null,
    signature_valid: signatureValid,
    payload: { ...safe, cardPan: cardPan ? "masked" : undefined },
  });
}

async function getByOrder(orderReference: string): Promise<BookingRow | null> {
  const { data, error } = await db().from("bookings").select("*").eq("order_reference", orderReference).maybeSingle();
  if (error) throw error;
  return (data as BookingRow) ?? null;
}

export async function getByToken(token: string): Promise<BookingRow | null> {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const { data, error } = await db().from("bookings").select("*").eq("public_token", token).maybeSingle();
  if (error) throw error;
  return (data as BookingRow) ?? null;
}

export async function getById(id: string): Promise<BookingRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db().from("bookings").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as BookingRow) ?? null;
}

function amountsMatch(b: BookingRow, tx: WfpTransaction): boolean {
  return Math.abs(Number(tx.amount) - Number(b.charge_amount)) < 0.005 && String(tx.currency).toUpperCase() === b.charge_currency.toUpperCase();
}

/**
 * Застосовує перевірену (з валідним підписом) транзакцію до бронювання.
 * Можна викликати скільки завгодно разів — побічні дії виконаються лише один раз.
 */
export async function applyTransaction(tx: WfpTransaction, source: "callback" | "check_status"): Promise<BookingRow | null> {
  await logPaymentEvent(tx, source, true);
  const booking = await getByOrder(tx.orderReference);
  if (!booking) return null;
  const status = tx.transactionStatus;

  if (PAID_STATUSES.has(status)) {
    if (!amountsMatch(booking, tx)) {
      await notifyOwnerSafe(
        `⚠️ <b>Розбіжність суми оплати</b>\nЗамовлення ${escapeHtml(booking.order_reference)}: очікувалось ${booking.charge_amount} ${booking.charge_currency}, отримано ${escapeHtml(String(tx.amount))} ${escapeHtml(String(tx.currency))}. Бронювання не підтверджено — перевір в адмінці.`,
        booking,
      );
      return booking;
    }
    return markPaid(booking, tx);
  }

  if (FAILED_STATUSES.has(status)) {
    const { data } = await db()
      .from("bookings")
      .update({ status: status === "Expired" ? "expired" : "failed", payment_status: status })
      .eq("id", booking.id)
      .eq("status", "pending_payment")
      .select("*")
      .maybeSingle();
    return (data as BookingRow) ?? booking;
  }

  if (REFUND_STATUSES.has(status)) {
    if (booking.status === "paid" || booking.status === "conflict" || booking.status === "cancelled") {
      const refunded = Number(tx.refundAmount ?? tx.amount ?? booking.charge_amount);
      const { data } = await db()
        .from("bookings")
        .update({ status: "refunded", payment_status: status, refunded_amount: refunded, refunded_at: new Date().toISOString() })
        .eq("id", booking.id)
        .in("status", ["paid", "conflict", "cancelled"])
        .select("*")
        .maybeSingle();
      if (data) await releaseResources(data as BookingRow);
      return (data as BookingRow) ?? booking;
    }
    return booking;
  }

  // Проміжні статуси — нічого не змінюємо
  await db().from("bookings").update({ payment_status: status }).eq("id", booking.id).eq("status", "pending_payment");
  return booking;
}

async function markPaid(booking: BookingRow, tx: WfpTransaction): Promise<BookingRow> {
  if (booking.status === "paid") {
    await fulfil(booking.id); // добудувати кроки, якщо раніше щось не вдалося
    return (await getById(booking.id)) ?? booking;
  }
  if (!["pending_payment", "expired", "failed"].includes(booking.status)) return booking;

  const patch = {
    status: "paid",
    paid_at: new Date().toISOString(),
    payment_status: tx.transactionStatus,
    payment_system: tx.paymentSystem ?? null,
    card_pan: tx.cardPan ?? null,
  };
  const { data, error } = await db()
    .from("bookings")
    .update(patch)
    .eq("id", booking.id)
    .in("status", ["pending_payment", "expired", "failed"])
    .select("*")
    .maybeSingle();

  if (error?.code === "23P01") {
    // Оплата прийшла після звільнення слота, а час уже зайняв інший клієнт
    const { data: c } = await db()
      .from("bookings")
      .update({ ...patch, status: "conflict" })
      .eq("id", booking.id)
      .select("*")
      .single();
    await notifyOwnerSafe(
      `⚠️ <b>Оплата після звільнення слота</b>\n${escapeHtml(booking.full_name)} оплатив(ла) «${escapeHtml(booking.service_name)}» на ${formatDateNumeric(new Date(booking.starts_at))} ${timeKey(new Date(booking.starts_at))}, але цей час уже зайнято. Потрібно запропонувати інший час або зробити повернення.`,
      booking,
    );
    return c as BookingRow;
  }
  if (error) throw error;
  if (!data) return (await getById(booking.id)) ?? booking; // інший процес уже обробив

  await fulfil(booking.id);
  return (await getById(booking.id)) ?? (data as BookingRow);
}

/** Сервером перевіряє статус платежу в WayForPay (якщо callback затримався або загубився) */
export async function syncPaymentStatus(booking: BookingRow): Promise<BookingRow> {
  if (!["pending_payment", "expired", "failed"].includes(booking.status)) return booking;
  const w = env.wayforpay();
  const tx = await checkStatus(
    { merchantAccount: w.merchantAccount, secretKey: w.secretKey, merchantDomainName: w.merchantDomainName },
    booking.order_reference,
  );
  if (!tx) return booking;
  return (await applyTransaction(tx, "check_status")) ?? booking;
}

// ---------------------------------------------------------------------------
// Виконання після оплати: кожен крок незалежний і повторюваний
// ---------------------------------------------------------------------------

function mailData(b: BookingRow): MailBooking {
  const service = getService(b.service_slug);
  const start = new Date(b.starts_at);
  const end = new Date(b.ends_at);
  return {
    firstName: b.full_name.split(/\s+/)[0],
    serviceName: b.service_name,
    start,
    durationLabel: service?.durationLabel ?? `${Math.round((end.getTime() - start.getTime()) / 60000)} хв`,
    zoomUrl: b.zoom_join_url,
    preparation: service?.preparation ?? [],
    icsUrl: `${env.siteUrl()}/api/bookings/ics?t=${b.public_token}`,
    googleUrl: googleCalendarUrl({
      start,
      end,
      summary: `${b.service_name} · ${site.person}`,
      location: b.zoom_join_url ?? "Zoom",
      description: b.zoom_join_url ? `Zoom: ${b.zoom_join_url}` : "",
    }),
    policies: site.policies,
    contactUrl: site.telegramContact,
    personName: site.person,
    questionnaireUrl: b.questionnaire_at ? null : `${env.siteUrl()}/booking/result?t=${b.public_token}`,
  };
}

export function clientIcs(b: BookingRow): string {
  return buildIcs({
    uid: `client-${b.id}@site`,
    start: new Date(b.starts_at),
    end: new Date(b.ends_at),
    summary: `${b.service_name} · ${site.person}`,
    description: b.zoom_join_url ? `Zoom: ${b.zoom_join_url}` : "Посилання на Zoom надійде особисто перед зустріччю.",
    location: b.zoom_join_url ?? "Zoom",
    url: b.zoom_join_url ?? undefined,
    alarmMinutesBefore: 60,
  });
}

function ownerEventIcs(b: BookingRow): string {
  const admin = `${env.siteUrl()}/admin/bookings/${b.id}`;
  return buildIcs({
    uid: `booking-${b.id}@site`,
    start: new Date(b.starts_at),
    end: new Date(b.ends_at),
    summary: `${b.service_name} — ${b.full_name}`,
    description: [
      `Instagram: ${b.instagram}`,
      `Контакт: ${b.contact}`,
      b.zoom_join_url ? `Zoom: ${b.zoom_join_url}` : `Zoom: надішли клієнту посилання вручну → ${b.contact} / ${b.email}`,
      "",
      `Анкета: ${admin}`,
    ].join("\n"),
    location: b.zoom_join_url ?? "Zoom",
    url: admin,
    alarmMinutesBefore: 30,
  });
}

async function claim(id: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - 3 * 60_000).toISOString();
  const { data } = await db()
    .from("bookings")
    .update({ fulfilling_since: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "paid")
    .or(`fulfilling_since.is.null,fulfilling_since.lt."${staleBefore}"`)
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

export async function fulfil(id: string): Promise<void> {
  if (!(await claim(id))) return;
  const errors: string[] = [];
  try {
    let b = (await getById(id))!;
    const service = getService(b.service_slug);

    if (!b.zoom_join_url && zoomMode() !== "manual") {
      try {
        const m = await createMeeting({
          topic: `${b.service_name} — ${b.full_name}`,
          start: new Date(b.starts_at),
          durationMin: service?.durationMin ?? 60,
        });
        if (m) {
          await db().from("bookings").update({ zoom_join_url: m.joinUrl, zoom_meeting_id: m.id }).eq("id", id);
          b = { ...b, zoom_join_url: m.joinUrl, zoom_meeting_id: m.id };
        }
      } catch (e) {
        errors.push(`Zoom: ${(e as Error).message}`);
      }
    }

    if (!b.calendar_event_url) {
      try {
        const url = await createEvent(`booking-${b.id}`, ownerEventIcs(b));
        await db().from("bookings").update({ calendar_event_url: url }).eq("id", id);
        b = { ...b, calendar_event_url: url };
      } catch (e) {
        errors.push(`Календар: ${(e as Error).message}`);
      }
    }

    // Лист клієнту відправляємо, лише коли є посилання на Zoom (або після кількох невдалих спроб — без нього)
    if (!b.confirmation_sent_at && (b.zoom_join_url || zoomMode() === "manual" || isOlderThan(b.paid_at, 30))) {
      try {
        const mail = confirmationEmail(mailData(b));
        await sendEmail({
          to: b.email,
          ...mail,
          attachments: [{ filename: "zustrich.ics", content: Buffer.from(clientIcs(b)).toString("base64"), contentType: "text/calendar" }],
        });
        await db().from("bookings").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", id);
      } catch (e) {
        errors.push(`Email: ${(e as Error).message}`);
      }
    }

    if (!b.owner_notified_at) {
      try {
        await sendTelegram(ownerPaidMessage(b, errors), { text: "Відкрити анкету", url: `${env.siteUrl()}/admin/bookings/${b.id}` });
        await db().from("bookings").update({ owner_notified_at: new Date().toISOString() }).eq("id", id);
      } catch (e) {
        errors.push(`Telegram: ${(e as Error).message}`);
      }
    }
  } finally {
    await db()
      .from("bookings")
      .update({ fulfilling_since: null, fulfilment_error: errors.length ? errors.join(" | ").slice(0, 1000) : null })
      .eq("id", id);
  }
}

function isOlderThan(iso: string | null, minutes: number): boolean {
  return Boolean(iso) && Date.now() - new Date(iso!).getTime() > minutes * 60_000;
}

function ownerPaidMessage(b: BookingRow, errors: string[]): string {
  const start = new Date(b.starts_at);
  const ig = b.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "@").replace(/\/$/, "");
  const lines = [
    "💸 <b>НОВА ОПЛАТА</b>",
    "",
    `Послуга: ${escapeHtml(b.service_name)}`,
    `Сума: ${b.price_eur} €${b.charge_currency !== "EUR" ? ` (${b.charge_amount} ${b.charge_currency})` : ""}`,
    `Клієнт: ${escapeHtml(b.full_name)}`,
    `Instagram: ${escapeHtml(ig)}`,
    `Дата: ${formatDateNumeric(start)}`,
    `Час: ${timeKey(start)}`,
    ...(b.questionnaire_at
      ? [`Запит: ${escapeHtml(truncate(b.main_request ?? "", 300))}`, `Запитання: ${escapeHtml(truncate(b.questions ?? "", 300))}`]
      : ["Анкета: клієнт заповнює після оплати — надішлю окреме повідомлення"]),
    `Статус: ОПЛАЧЕНО`,
    ...(b.zoom_join_url ? [] : ["", `🔗 Надішли посилання на Zoom: ${escapeHtml(b.contact)} · ${escapeHtml(b.email)}`]),
  ];
  if (errors.length) lines.push("", `⚠️ Потребує уваги: ${escapeHtml(errors.join("; "))}`);
  lines.push("", `Анкета: ${env.siteUrl()}/admin/bookings/${b.id}`);
  return lines.join("\n");
}

async function notifyOwnerSafe(html: string, b?: BookingRow) {
  try {
    await sendTelegram(html, b ? { text: "Відкрити в адмінці", url: `${env.siteUrl()}/admin/bookings/${b.id}` } : undefined);
  } catch (e) {
    console.error("[telegram]", e);
  }
}

// ---------------------------------------------------------------------------
// Скасування та повернення (з адмінки)
// ---------------------------------------------------------------------------

async function releaseResources(b: BookingRow) {
  const errs: string[] = [];
  if (b.calendar_event_url) {
    try {
      await deleteEvent(b.calendar_event_url);
    } catch (e) {
      errs.push((e as Error).message);
    }
  }
  if (b.zoom_meeting_id) {
    try {
      await deleteMeeting(b.zoom_meeting_id);
    } catch (e) {
      errs.push((e as Error).message);
    }
  }
  await db()
    .from("bookings")
    .update({ calendar_event_url: errs.length ? b.calendar_event_url : null, fulfilment_error: errs.length ? errs.join(" | ") : null })
    .eq("id", b.id);
}

export async function refundBooking(id: string, opts: { amount?: number; comment: string; notifyClient: boolean }) {
  const b = await getById(id);
  if (!b) throw new BookingError("not_found", "Бронювання не знайдено");
  if (!["paid", "conflict", "cancelled"].includes(b.status)) throw new BookingError("invalid", "Повернення можливе лише для оплачених бронювань");
  const amount = opts.amount && opts.amount > 0 ? Math.min(opts.amount, Number(b.charge_amount) - Number(b.refunded_amount)) : Number(b.charge_amount) - Number(b.refunded_amount);
  if (amount <= 0) throw new BookingError("invalid", "Кошти вже повернуто");

  const w = env.wayforpay();
  const r = await wfpRefund(
    { merchantAccount: w.merchantAccount, secretKey: w.secretKey, merchantDomainName: w.merchantDomainName },
    { orderReference: b.order_reference, amount, currency: b.charge_currency, comment: opts.comment || "Повернення за бронюванням" },
  );
  await db().from("payment_events").insert({
    order_reference: b.order_reference,
    source: "refund",
    transaction_status: r.transactionStatus ?? null,
    signature_valid: true,
    payload: r,
  });
  if (!r.ok) throw new BookingError("invalid", `WayForPay відхилив повернення: ${r.reason ?? r.transactionStatus ?? "невідома причина"}`);

  const total = Number(b.refunded_amount) + amount;
  const full = total >= Number(b.charge_amount) - 0.005;
  const { data } = await db()
    .from("bookings")
    .update({
      status: full ? "refunded" : b.status,
      refunded_amount: total,
      refunded_at: new Date().toISOString(),
      payment_status: r.transactionStatus,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (full) await releaseResources(data as BookingRow);
  if (opts.notifyClient) await sendCancellation(data as BookingRow, true);
  return data as BookingRow;
}

export async function cancelBooking(id: string, opts: { notifyClient: boolean }) {
  const b = await getById(id);
  if (!b) throw new BookingError("not_found", "Бронювання не знайдено");
  if (!["paid", "pending_payment", "conflict"].includes(b.status)) throw new BookingError("invalid", "Це бронювання вже неактивне");
  const { data } = await db()
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  await releaseResources(data as BookingRow);
  if (opts.notifyClient && b.status !== "pending_payment") await sendCancellation(data as BookingRow, false);
  return data as BookingRow;
}

async function sendCancellation(b: BookingRow, refunded: boolean) {
  try {
    const mail = cancellationEmail(
      { firstName: b.full_name.split(/\s+/)[0], serviceName: b.service_name, start: new Date(b.starts_at), contactUrl: site.telegramContact, personName: site.person },
      refunded,
    );
    await sendEmail({ to: b.email, ...mail });
  } catch (e) {
    console.error("[email] cancellation", e);
  }
}

export async function resendConfirmation(id: string) {
  const b = await getById(id);
  if (!b || b.status !== "paid") throw new BookingError("invalid", "Лист можна надіслати лише для оплаченого бронювання");
  const mail = confirmationEmail(mailData(b));
  await sendEmail({
    to: b.email,
    ...mail,
    attachments: [{ filename: "zustrich.ics", content: Buffer.from(clientIcs(b)).toString("base64"), contentType: "text/calendar" }],
  });
  await db().from("bookings").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", id);
}

// ---------------------------------------------------------------------------
// Анкета після оплати
// ---------------------------------------------------------------------------

export async function saveQuestionnaire(token: string, form: BookingForm): Promise<BookingRow> {
  const b = await getByToken(token);
  if (!b) throw new BookingError("not_found", "Бронювання не знайдено");
  if (!["paid", "conflict"].includes(b.status)) throw new BookingError("invalid", "Анкету можна заповнити після оплати");
  const service = getService(b.service_slug);
  const firstTime = !b.questionnaire_at;
  const { data, error } = await db()
    .from("bookings")
    .update({
      occupation: form.occupation,
      main_request: form.mainRequest,
      desired_result: form.desiredResult,
      questions: form.questions,
      socials: {
        tiktok: form.tiktok || undefined,
        youtube: form.youtube || undefined,
        website: form.website || undefined,
        other: form.otherSocials.length ? form.otherSocials : undefined,
      },
      strategy: service?.extendedForm
        ? { products: form.products, averageCheck: form.averageCheck, acquisitionProblems: form.acquisitionProblems, goal3m: form.goal3m }
        : null,
      questionnaire_at: new Date().toISOString(),
    })
    .eq("id", b.id)
    .select("*")
    .single();
  if (error) throw error;
  const row = data as BookingRow;
  const start = new Date(row.starts_at);
  await notifyOwnerSafe(
    [
      `📝 <b>${firstTime ? "АНКЕТУ ЗАПОВНЕНО" : "АНКЕТУ ОНОВЛЕНО"}</b>`,
      "",
      `Клієнт: ${escapeHtml(row.full_name)}`,
      `Послуга: ${escapeHtml(row.service_name)}, ${formatDateNumeric(start)} ${timeKey(start)}`,
      `Запит: ${escapeHtml(truncate(row.main_request ?? "", 300))}`,
      `Результат: ${escapeHtml(truncate(row.desired_result ?? "", 200))}`,
      `Запитання: ${escapeHtml(truncate(row.questions ?? "", 300))}`,
    ].join("\n"),
    row,
  );
  return row;
}

// ---------------------------------------------------------------------------
// Планувальник (cron): звільнення слотів, перевірка платежів, нагадування, повтор кроків
// ---------------------------------------------------------------------------

export async function runScheduledTick(now = new Date()) {
  const report = { expired: 0, synced: 0, reminders: 0, refulfilled: 0, errors: [] as string[] };

  // 1. Платежі, що зависли: перевіряємо статус у WayForPay (до 6 годин від створення)
  const { data: pending } = await db()
    .from("bookings")
    .select("*")
    .eq("status", "pending_payment")
    .lt("created_at", new Date(now.getTime() - 2 * 60_000).toISOString())
    .gt("created_at", new Date(now.getTime() - 6 * 3600_000).toISOString())
    .limit(50);
  for (const b of (pending ?? []) as BookingRow[]) {
    try {
      await syncPaymentStatus(b);
      report.synced++;
    } catch (e) {
      report.errors.push(`sync ${b.order_reference}: ${(e as Error).message}`);
    }
  }

  // 2. Звільняємо прострочені утримання
  const { data: expired } = await db().rpc("expire_stale_holds");
  report.expired = Number(expired ?? 0);

  // 3. Добудовуємо кроки для оплачених, де щось не вдалося
  const { data: incomplete } = await db()
    .from("bookings")
    .select("id")
    .eq("status", "paid")
    .gt("starts_at", now.toISOString())
    .or(`calendar_event_url.is.null,${zoomMode() === "manual" ? "" : "zoom_join_url.is.null,"}confirmation_sent_at.is.null,owner_notified_at.is.null`)
    .limit(20);
  for (const r of (incomplete ?? []) as { id: string }[]) {
    try {
      await fulfil(r.id);
      report.refulfilled++;
    } catch (e) {
      report.errors.push(`fulfil ${r.id}: ${(e as Error).message}`);
    }
  }

  // 4. Нагадування за 24 години
  const { data: soon } = await db()
    .from("bookings")
    .select("*")
    .eq("status", "paid")
    .is("reminder_sent_at", null)
    .not("confirmation_sent_at", "is", null)
    .gt("starts_at", new Date(now.getTime() + 2 * 3600_000).toISOString())
    .lte("starts_at", new Date(now.getTime() + 24 * 3600_000).toISOString())
    .limit(50);
  for (const b of (soon ?? []) as BookingRow[]) {
    // якщо бронювали менш ніж за добу — лист-підтвердження і є нагадуванням
    if (b.paid_at && new Date(b.starts_at).getTime() - new Date(b.paid_at).getTime() < 26 * 3600_000) {
      await db().from("bookings").update({ reminder_sent_at: now.toISOString() }).eq("id", b.id);
      continue;
    }
    try {
      const mail = reminderEmail(mailData(b));
      await sendEmail({ to: b.email, ...mail });
      await db().from("bookings").update({ reminder_sent_at: now.toISOString() }).eq("id", b.id);
      report.reminders++;
    } catch (e) {
      report.errors.push(`reminder ${b.id}: ${(e as Error).message}`);
    }
  }

  return report;
}

/**
 * Перевірка підключень. Кожна перевірка робить СПРАВЖНІЙ запит до сервісу,
 * результат зберігається в integration_checks. Без успішної перевірки сервіс
 * показується в адмінці як «не перевірено», а не «працює».
 */
import "server-only";
import { db } from "./supabase/admin.ts";
import { env, ConfigError } from "./env.ts";
import { listCalendars, getBusy } from "./caldav.ts";
import { probeCredentials } from "./wayforpay.ts";
import { sendTelegram } from "./telegram.ts";
import { sendEmail } from "./email.ts";
import { addDays, dateKey, zonedToUtc } from "./time.ts";

export type CheckName = "supabase" | "wayforpay" | "icloud" | "zoom" | "telegram" | "email" | "cron";

export type CheckResult = { ok: boolean; detail: string };

export const CHECKS: { name: CheckName; title: string; what: string; env: string[] }[] = [
  { name: "supabase", title: "База даних", what: "Запис і читання з бази Supabase", env: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] },
  { name: "wayforpay", title: "WayForPay — ключі", what: "Логін і секретний ключ приймаються API (без списання коштів)", env: ["WAYFORPAY_MERCHANT_ACCOUNT", "WAYFORPAY_SECRET_KEY", "WAYFORPAY_MERCHANT_DOMAIN", "WAYFORPAY_CURRENCY"] },
  { name: "icloud", title: "Apple Calendar (iCloud)", what: "Читання зайнятості та наявність календаря для зустрічей", env: ["ICLOUD_APPLE_ID", "ICLOUD_APP_PASSWORD", "ICLOUD_BOOKING_CALENDAR"] },
  { name: "zoom", title: "Zoom", what: "Отримання доступу до API (або запасне посилання)", env: ["ZOOM_ACCOUNT_ID", "ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET", "ZOOM_FALLBACK_LINK"] },
  { name: "telegram", title: "Telegram", what: "Тестове повідомлення в твій особистий чат", env: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] },
  { name: "email", title: "Листи клієнтам (Resend)", what: "Тестовий лист на твою пошту адміністратора", env: ["RESEND_API_KEY", "EMAIL_FROM"] },
  { name: "cron", title: "Планувальник", what: "Нагадування, звільнення слотів, повторні спроби — оновлюється автоматично при кожному запуску", env: ["CRON_SECRET"] },
];

export async function saveCheck(name: string, r: CheckResult) {
  await db().from("integration_checks").upsert({ name, ok: r.ok, detail: r.detail.slice(0, 1000), checked_at: new Date().toISOString() });
}

function fail(e: unknown): CheckResult {
  if (e instanceof ConfigError) return { ok: false, detail: `Не задано змінну ${e.variable}` };
  return { ok: false, detail: (e as Error).message || String(e) };
}

async function checkSupabase(): Promise<CheckResult> {
  const { error } = await db().from("availability_settings").select("id").eq("id", 1).maybeSingle();
  if (error) return { ok: false, detail: `${error.message}. Перевір, що виконано SQL з supabase/migrations.` };
  const probe = await db().from("integration_checks").upsert({ name: "supabase", ok: true, detail: "пробний запис", checked_at: new Date().toISOString() });
  if (probe.error) return { ok: false, detail: probe.error.message };
  return { ok: true, detail: "Таблиці на місці, запис і читання працюють." };
}

async function checkWayforpay(): Promise<CheckResult> {
  const w = env.wayforpay();
  const site = env.siteUrl();
  const r = await probeCredentials({ merchantAccount: w.merchantAccount, secretKey: w.secretKey, merchantDomainName: w.merchantDomainName });
  const notes = [`Магазин (логін, не секрет): ${w.merchantAccount}.`, `Відповідь: ${r.reasonCode ?? "—"} ${r.reason}`, r.hint, `Валюта списання: ${w.currency}${w.currency !== "EUR" ? (w.autoRate ? " (курс НБУ, автоматично)" : ` (курс ${w.eurRate})`) : ""}.`];
  if (!site.startsWith("https://")) notes.push("NEXT_PUBLIC_SITE_URL не https — сповіщення про оплату не дійдуть.");
  else if (!site.includes(w.merchantDomainName)) notes.push(`Домен сайту (${site}) не збігається з WAYFORPAY_MERCHANT_DOMAIN (${w.merchantDomainName}).`);
  return { ok: r.ok && site.startsWith("https://"), detail: notes.join(" ") };
}

async function checkIcloud(): Promise<CheckResult> {
  const cfg = env.icloud();
  const cals = await listCalendars();
  const names = cals.map((c) => c.name);
  const target = names.find((n) => n.toLowerCase() === cfg.bookingCalendar.toLowerCase());
  const today = dateKey(new Date());
  const busy = await getBusy({ start: zonedToUtc(today, "00:00"), end: zonedToUtc(addDays(today, 14), "00:00") }, { fresh: true });
  if (!target) {
    return { ok: false, detail: `Підключення є, але календаря «${cfg.bookingCalendar}» не знайдено. Знайдені: ${names.join(", ") || "немає"}.` };
  }
  return { ok: true, detail: `Календарі: ${names.join(", ")}. Зайнятих проміжків на 14 днів: ${busy.length}. Зустрічі записуватимуться в «${target}».` };
}

async function checkZoom(): Promise<CheckResult> {
  const z = env.zoom();
  if (!(z.accountId && z.clientId && z.clientSecret)) {
    return z.fallbackLink
      ? { ok: true, detail: `API не підключено, використовується постійне посилання: ${z.fallbackLink}` }
      : { ok: true, detail: "Ручний режим: посилання на зустріч ти надсилаєш клієнту сама. Сайт нагадає про це в Telegram і в події календаря." };
  }
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(z.accountId)}`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${z.clientId}:${z.clientSecret}`).toString("base64") },
    cache: "no-store",
  });
  if (!res.ok) return { ok: false, detail: `Zoom відхилив ключі (${res.status}). Перевір Account ID, Client ID, Client Secret і що застосунок активовано.` };
  const data = (await res.json()) as { scope?: string };
  const scope = data.scope ?? "";
  const canWrite = /meeting:write/.test(scope);
  return {
    ok: canWrite,
    detail: canWrite ? "Ключі прийнято, дозвіл на створення зустрічей є." : `Ключі прийнято, але немає дозволу meeting:write. Доступні: ${scope || "—"}`,
  };
}

async function checkTelegram(): Promise<CheckResult> {
  await sendTelegram("✅ Тест підключення: сповіщення з сайту приходять у цей чат.");
  return { ok: true, detail: "Тестове повідомлення відправлено — переконайся, що воно прийшло в Telegram." };
}

async function checkEmail(to: string): Promise<CheckResult> {
  await sendEmail({
    to,
    subject: "Тест: листи з сайту працюють",
    html: "<p>Це тестовий лист із сайту. Якщо ти його бачиш — листи клієнтам відправляються.</p>",
    text: "Тестовий лист із сайту.",
  });
  return { ok: true, detail: `Тестовий лист відправлено на ${to}. Перевір «Вхідні» і «Спам».` };
}

export async function runCheck(name: CheckName, adminEmail: string): Promise<CheckResult> {
  let r: CheckResult;
  try {
    switch (name) {
      case "supabase":
        r = await checkSupabase();
        break;
      case "wayforpay":
        r = await checkWayforpay();
        break;
      case "icloud":
        r = await checkIcloud();
        break;
      case "zoom":
        r = await checkZoom();
        break;
      case "telegram":
        r = await checkTelegram();
        break;
      case "email":
        r = await checkEmail(adminEmail);
        break;
      default:
        r = { ok: false, detail: "Ця перевірка оновлюється автоматично" };
    }
  } catch (e) {
    r = fail(e);
  }
  try {
    await saveCheck(name, r);
  } catch {
    /* якщо база недоступна — результат все одно показуємо */
  }
  return r;
}

export async function getChecks(): Promise<Record<string, { ok: boolean; detail: string; checked_at: string }>> {
  const { data } = await db().from("integration_checks").select("*");
  return Object.fromEntries((data ?? []).map((r: { name: string; ok: boolean; detail: string; checked_at: string }) => [r.name, r]));
}

/**
 * Наскрізні перевірки — лише за реальними подіями в базі (справжня оплата, подія в календарі, повернення).
 * Їх неможливо «натиснути» — вони стають зеленими після тестового бронювання.
 */
export async function getEndToEnd() {
  type Row = { id: string; updated_at: string };
  const latest = async (column: string): Promise<Row | null> => {
    const { data } = await db().from("bookings").select("id, updated_at").not(column, "is", null).order("updated_at", { ascending: false }).limit(1);
    return ((data ?? []) as Row[])[0] ?? null;
  };
  const { data: cb } = await db()
    .from("payment_events")
    .select("order_reference, created_at")
    .eq("source", "callback")
    .eq("signature_valid", true)
    .eq("transaction_status", "Approved")
    .order("created_at", { ascending: false })
    .limit(1);
  const { data: rf } = await db().from("bookings").select("id, updated_at").gt("refunded_amount", 0).order("updated_at", { ascending: false }).limit(1);
  const callback = ((cb ?? []) as { order_reference: string; created_at: string }[])[0];
  const refund = ((rf ?? []) as Row[])[0];
  const [cal, zoom, mail, tg] = await Promise.all([
    latest("calendar_event_url"),
    latest("zoom_join_url"),
    latest("confirmation_sent_at"),
    latest("owner_notified_at"),
  ]);
  return [
    { title: "Оплата підтверджена сповіщенням WayForPay", at: callback?.created_at ?? null },
    { title: "Зустріч додано в Apple Calendar", at: cal?.updated_at ?? null },
    { title: "Посилання Zoom створено", at: zoom?.updated_at ?? null },
    { title: "Клієнт отримав лист-підтвердження", at: mail?.updated_at ?? null },
    { title: "Тобі прийшло Telegram-сповіщення", at: tg?.updated_at ?? null },
    { title: "Повернення коштів через адмінку", at: refund?.updated_at ?? null },
  ];
}

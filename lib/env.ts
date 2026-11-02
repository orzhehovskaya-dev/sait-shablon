/**
 * Доступ до змінних середовища з чіткими помилками.
 * Жоден секрет не має префікса NEXT_PUBLIC_ — отже, не потрапляє в браузер.
 */

function req(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new ConfigError(name);
  return v.trim();
}

/** Перше задане значення з кількох можливих назв змінної (інтеграції називають їх по-різному) */
function reqAny(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  throw new ConfigError(names[0]);
}

function opt(name: string, def = ""): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : def;
}

export class ConfigError extends Error {
  constructor(public variable: string) {
    super(`Не налаштовано змінну середовища ${variable}`);
    this.name = "ConfigError";
  }
}

export const env = {
  siteUrl: () => opt("NEXT_PUBLIC_SITE_URL", "http://localhost:3000").replace(/\/+$/, ""),

  supabase: () => ({
    url: reqAny("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
    anonKey: reqAny("NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    serviceKey: reqAny("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"),
  }),

  wayforpay: () => {
    const currency = opt("WAYFORPAY_CURRENCY", "EUR").toUpperCase();
    const rateRaw = opt("WAYFORPAY_EUR_RATE", "auto").toLowerCase();
    const autoRate = rateRaw === "auto";
    const rate = autoRate ? 0 : Number(rateRaw);
    if (currency !== "EUR" && !autoRate && !(rate > 0)) throw new ConfigError("WAYFORPAY_EUR_RATE");
    return {
      merchantAccount: req("WAYFORPAY_MERCHANT_ACCOUNT"),
      secretKey: req("WAYFORPAY_SECRET_KEY"),
      merchantDomainName: req("WAYFORPAY_MERCHANT_DOMAIN"),
      currency,
      /** Курс EUR → валюта списання (лише якщо списання не в євро). 0 = автоматично за курсом НБУ */
      eurRate: currency === "EUR" ? 1 : rate,
      autoRate: currency !== "EUR" && autoRate,
    };
  },

  icloud: () => ({
    appleId: req("ICLOUD_APPLE_ID"),
    appPassword: req("ICLOUD_APP_PASSWORD"),
    bookingCalendar: opt("ICLOUD_BOOKING_CALENDAR", "Мої зустрічі"),
    ignoreCalendars: opt("ICLOUD_IGNORE_CALENDARS")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    allDayBlocks: opt("ICLOUD_ALLDAY_BLOCKS", "true") !== "false",
  }),

  zoom: () => ({
    accountId: opt("ZOOM_ACCOUNT_ID"),
    clientId: opt("ZOOM_CLIENT_ID"),
    clientSecret: opt("ZOOM_CLIENT_SECRET"),
    /** Постійне посилання (наприклад, персональна кімната), якщо API Zoom не підключено */
    fallbackLink: opt("ZOOM_FALLBACK_LINK"),
  }),

  telegram: () => ({
    token: opt("TELEGRAM_BOT_TOKEN"),
    chatId: opt("TELEGRAM_CHAT_ID"),
  }),

  email: () => ({
    resendKey: opt("RESEND_API_KEY"),
    from: opt("EMAIL_FROM", "Мій сайт <hello@example.com>"),
    replyTo: opt("EMAIL_REPLY_TO", ""),
  }),

  cronSecret: () => req("CRON_SECRET"),

  holdMinutes: () => {
    const n = Number(opt("BOOKING_HOLD_MINUTES", "20"));
    return Number.isFinite(n) && n >= 5 && n <= 60 ? Math.round(n) : 20;
  },
};

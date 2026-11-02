/**
 * Робота з часовими поясами без сторонніх бібліотек (Intl API).
 * Усі розрахунки слотів ведуться у Europe/Kyiv, у базі час зберігається в UTC.
 */

export const TZ = "Europe/Kyiv";

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Розкладає момент часу на складові в заданому поясі. weekday: 1 = понеділок … 7 = неділя */
export function partsInTz(date: Date, tz: string = TZ): Parts {
  const out: Record<string, string> = {};
  for (const p of dtf(tz).formatToParts(date)) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAYS[out.weekday] ?? 0,
  };
}

/** Зсув поясу відносно UTC у хвилинах для конкретного моменту (+180 для Києва влітку) */
export function tzOffsetMinutes(date: Date, tz: string = TZ): number {
  const p = partsInTz(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** «2026-10-25» + «14:00» у поясі tz → UTC Date. Коректно працює на переході на літній/зимовий час. */
export function zonedToUtc(dateStr: string, timeStr: string, tz: string = TZ): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
  let guess = naive - tzOffsetMinutes(new Date(naive), tz) * 60000;
  // друга ітерація — на випадок, якщо зсув у момент guess відрізняється (DST)
  guess = naive - tzOffsetMinutes(new Date(guess), tz) * 60000;
  return new Date(guess);
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dateKey(date: Date, tz: string = TZ): string {
  const p = partsInTz(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function timeKey(date: Date, tz: string = TZ): string {
  const p = partsInTz(date, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Додає дні до рядка дати YYYY-MM-DD (календарні дні, без прив'язки до поясу) */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** День тижня для рядка дати: 1 = понеділок … 7 = неділя */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function isValidDateKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function isValidTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function formatDateUk(date: Date, tz: string = TZ, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("uk-UA", { timeZone: tz, day: "numeric", month: "long", weekday: "long", ...opts }).format(date);
}

/** 25.10.2026 */
export function formatDateNumeric(date: Date, tz: string = TZ): string {
  const p = partsInTz(date, tz);
  return `${pad(p.day)}.${pad(p.month)}.${p.year}`;
}

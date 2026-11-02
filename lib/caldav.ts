/**
 * iCloud Calendar через CalDAV (офіційний протокол Apple).
 * Потрібні: Apple ID і пароль застосунку (appleid.apple.com → «Вхід і безпека» → «Паролі застосунків»).
 *
 * Що робить модуль:
 *  - знаходить усі календарі облікового запису;
 *  - читає події за період і повертає зайнятий час;
 *  - створює / видаляє подію бронювання в окремому календарі.
 */
import "server-only";
import { extractBusy } from "./ical-busy.ts";
import type { Interval } from "./slots.ts";
import { env } from "./env.ts";

const ICLOUD_ROOT = "https://caldav.icloud.com/";

type Calendar = { url: string; name: string; ctag?: string };

function authHeader(): string {
  const { appleId, appPassword } = env.icloud();
  // пароль застосунку Apple: 16 літер, дефіси необов'язкові; пробіли з копіювання прибираємо
  const pass = appPassword.replace(/\s+/g, "");
  return "Basic " + Buffer.from(`${appleId.trim().toLowerCase()}:${pass}`).toString("base64");
}

/** Підказки без розкриття секретів: лише формат значень */
function credentialHints(): string {
  const { appleId, appPassword } = env.icloud();
  const id = appleId.trim();
  const pass = appPassword.replace(/\s+/g, "");
  const notes: string[] = [];
  const nonAscii = (v: string) => /[^\x21-\x7e]/.test(v);
  const [user = "", domain = ""] = id.split("@");
  notes.push(`Apple ID: ${user.slice(0, 2)}…@${domain || "?"} (${id.length} символів).`);
  if (nonAscii(id)) notes.push("⚠️ В Apple ID є не латинські символи (можливо, українська «о», «а», «е» тощо) — введи його заново на англійській розкладці.");
  if (!id.includes("@")) notes.push("⚠️ Apple ID має бути адресою пошти.");
  notes.push(`Пароль застосунку: ${pass.length} символів.`);
  if (nonAscii(pass)) notes.push("⚠️ У паролі є не латинські символи — введи його на англійській розкладці.");
  else if (/^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/.test(pass) || /^[a-z]{16}$/.test(pass)) notes.push("Формат пароля правильний (xxxx-xxxx-xxxx-xxxx) — отже, Apple не приймає саме цей пароль: можливо, він видалений або в ньому помилка в літері.");
  else notes.push("⚠️ Формат пароля не схожий на пароль застосунку Apple (має бути xxxx-xxxx-xxxx-xxxx, 19 символів з дефісами, маленькі англійські літери).");
  notes.push(`Версія сайту: ${(process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "локальна").slice(0, 12)}.`);
  return notes.join(" ");
}

async function dav(method: string, url: string, body: string | null, headers: Record<string, string> = {}): Promise<Response> {
  // Переадресації обробляємо вручну: fetch прибирає заголовок Authorization при переході на інший хост
  // (caldav.icloud.com → pXX-caldav.icloud.com), через що iCloud відповідав би 401.
  let target = url;
  let res: Response;
  for (let hop = 0; ; hop++) {
    res = await fetch(target, {
      method,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/xml; charset=utf-8",
        ...headers,
      },
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    const loc = res.headers.get("location");
    if (hop < 5 && [301, 302, 307, 308].includes(res.status) && loc) {
      target = new URL(loc, target).toString();
      continue;
    }
    break;
  }
  if (res.status === 401) throw new Error("iCloud не прийняв вхід (401). " + credentialHints());
  return res;
}

function decodeXml(s: string): string {
  return s
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#13;/g, "\r")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

/** Витягує вміст тегу з будь-яким префіксом простору імен */
function tagContents(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function firstHref(xml: string): string | null {
  const h = tagContents(xml, "href")[0];
  return h ? decodeXml(h.trim()) : null;
}

function absolute(base: string, href: string): string {
  return new URL(href, base).toString();
}

let cachedHome: { url: string; at: number } | null = null;

async function calendarHome(): Promise<string> {
  if (cachedHome && Date.now() - cachedHome.at < 6 * 3600_000) return cachedHome.url;

  const principalRes = await dav(
    "PROPFIND",
    ICLOUD_ROOT,
    `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`,
    { Depth: "0" },
  );
  const principalXml = await principalRes.text();
  const cup = tagContents(principalXml, "current-user-principal")[0];
  const principalHref = cup ? firstHref(cup) : null;
  if (!principalHref) throw new Error("iCloud: не вдалося знайти обліковий запис календаря");
  const principalUrl = absolute(principalRes.url || ICLOUD_ROOT, principalHref);

  const homeRes = await dav(
    "PROPFIND",
    principalUrl,
    `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`,
    { Depth: "0" },
  );
  const homeXml = await homeRes.text();
  const homeSet = tagContents(homeXml, "calendar-home-set")[0];
  const homeHref = homeSet ? firstHref(homeSet) : null;
  if (!homeHref) throw new Error("iCloud: не вдалося знайти календарі");
  const url = absolute(homeRes.url || principalUrl, homeHref);
  cachedHome = { url, at: Date.now() };
  return url;
}

export async function listCalendars(): Promise<Calendar[]> {
  const home = await calendarHome();
  const res = await dav(
    "PROPFIND",
    home,
    `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
  <d:prop><d:resourcetype/><d:displayname/><cs:getctag/><c:supported-calendar-component-set/></d:prop>
</d:propfind>`,
    { Depth: "1" },
  );
  const xml = await res.text();
  const calendars: Calendar[] = [];
  for (const resp of tagContents(xml, "response")) {
    const rt = tagContents(resp, "resourcetype")[0] ?? "";
    if (!/<(?:[\w-]+:)?calendar[\s/>]/i.test(rt)) continue;
    const comps = tagContents(resp, "supported-calendar-component-set")[0] ?? "";
    if (comps && !/VEVENT/i.test(comps)) continue; // пропускаємо «Нагадування»
    const href = firstHref(resp);
    if (!href) continue;
    calendars.push({
      url: absolute(home, href),
      name: decodeXml((tagContents(resp, "displayname")[0] ?? "").trim()),
      ctag: tagContents(resp, "getctag")[0],
    });
  }
  return calendars;
}

function caldavUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

async function fetchEventsIcs(calendarUrl: string, range: Interval): Promise<string[]> {
  const res = await dav(
    "REPORT",
    calendarUrl,
    `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data/></d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${caldavUtc(range.start)}" end="${caldavUtc(range.end)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`,
    { Depth: "1" },
  );
  if (res.status !== 207 && !res.ok) throw new Error(`iCloud: помилка читання календаря (${res.status})`);
  const xml = await res.text();
  return tagContents(xml, "calendar-data").map((s) => decodeXml(s.trim()));
}

// Короткий кеш, щоб кожен відвідувач не навантажував iCloud. Перед створенням броні кеш не використовується.
let busyCache: { key: string; at: number; data: Interval[] } | null = null;

export async function getBusy(range: Interval, opts: { fresh?: boolean } = {}): Promise<Interval[]> {
  const key = `${range.start.toISOString()}|${range.end.toISOString()}`;
  if (!opts.fresh && busyCache && busyCache.key === key && Date.now() - busyCache.at < 60_000) return busyCache.data;

  const cfg = env.icloud();
  const ignored = new Set(cfg.ignoreCalendars.map((s) => s.toLowerCase()));
  const calendars = (await listCalendars()).filter((c) => !ignored.has(c.name.toLowerCase()));
  const texts = (await Promise.all(calendars.map((c) => fetchEventsIcs(c.url, range)))).flat();
  const data = extractBusy(texts, range, { allDayBlocks: cfg.allDayBlocks });
  busyCache = { key, at: Date.now(), data };
  return data;
}

export function invalidateBusyCache() {
  busyCache = null;
}

async function bookingCalendarUrl(): Promise<string> {
  const name = env.icloud().bookingCalendar.toLowerCase();
  const cal = (await listCalendars()).find((c) => c.name.toLowerCase() === name);
  if (!cal) throw new Error(`iCloud: не знайдено календар «${env.icloud().bookingCalendar}». Створи його в застосунку «Календар».`);
  return cal.url.endsWith("/") ? cal.url : cal.url + "/";
}

/** Створює подію. Повертає URL об'єкта, щоб потім можна було видалити. Повторний виклик з тим самим uid безпечний. */
export async function createEvent(uid: string, ics: string): Promise<string> {
  const url = (await bookingCalendarUrl()) + encodeURIComponent(uid) + ".ics";
  const res = await dav("PUT", url, ics, { "Content-Type": "text/calendar; charset=utf-8" });
  if (!(res.ok || res.status === 201 || res.status === 204)) {
    throw new Error(`iCloud: не вдалося створити подію (${res.status})`);
  }
  invalidateBusyCache();
  return url;
}

export async function deleteEvent(url: string): Promise<void> {
  const res = await dav("DELETE", url, null);
  if (!(res.ok || res.status === 404 || res.status === 204)) throw new Error(`iCloud: не вдалося видалити подію (${res.status})`);
  invalidateBusyCache();
}

/**
 * Перетворює дані календаря (iCalendar) на список зайнятих інтервалів.
 * Враховує повторювані події, винятки з серій, скасовані та «вільні» події, події на весь день.
 */
import ICAL from "ical.js";
import { zonedToUtc, TZ } from "./time.ts";
import type { Interval } from "./slots.ts";

export type BusyOptions = {
  /** Чи блокують події «на весь день» (відпустка, вихідний). За замовчуванням — так. */
  allDayBlocks: boolean;
  /** Захист від нескінченних серій */
  maxOccurrencesPerEvent?: number;
  defaultTz?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyIcal = any;

function isValidTz(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ICAL.Time → JS Date з урахуванням дат без часу та невідомих/«плаваючих» поясів */
function toDate(t: AnyIcal, tzidParam: string | null, defaultTz: string): Date {
  if (t.isDate) {
    return zonedToUtc(`${t.year}-${pad(t.month)}-${pad(t.day)}`, "00:00", defaultTz);
  }
  const zoneId: string | undefined = t.zone?.tzid;
  if (zoneId === "UTC" || (zoneId && zoneId !== "floating" && t.zone !== ICAL.Timezone.localTimezone)) {
    return t.toJSDate();
  }
  const tz = isValidTz(tzidParam) ? tzidParam : defaultTz;
  const d = zonedToUtc(`${t.year}-${pad(t.month)}-${pad(t.day)}`, `${pad(t.hour)}:${pad(t.minute)}`, tz);
  return new Date(d.getTime() + t.second * 1000);
}

function isFree(comp: AnyIcal): boolean {
  const transp = String(comp.getFirstPropertyValue("transp") ?? "").toUpperCase();
  const status = String(comp.getFirstPropertyValue("status") ?? "").toUpperCase();
  return transp === "TRANSPARENT" || status === "CANCELLED";
}

export function extractBusy(icsTexts: string[], range: Interval, opts: BusyOptions): Interval[] {
  const defaultTz = opts.defaultTz ?? TZ;
  const maxOcc = opts.maxOccurrencesPerEvent ?? 2000;
  const out: Interval[] = [];
  const rangeStart = range.start.getTime();
  const rangeEnd = range.end.getTime();

  const push = (start: Date, end: Date, allDay: boolean) => {
    if (allDay && !opts.allDayBlocks) return;
    if (end.getTime() <= start.getTime()) end = new Date(start.getTime() + (allDay ? 86400000 : 0));
    if (end.getTime() > rangeStart && start.getTime() < rangeEnd) out.push({ start, end });
  };

  for (const text of icsTexts) {
    let root: AnyIcal;
    try {
      root = new ICAL.Component(ICAL.parse(text));
    } catch {
      continue; // пошкоджений об'єкт календаря не повинен ламати весь розклад
    }
    for (const vtz of root.getAllSubcomponents("vtimezone")) {
      try {
        ICAL.TimezoneService.register(vtz);
      } catch {
        /* ignore */
      }
    }

    const vevents: AnyIcal[] = root.getAllSubcomponents("vevent");
    const masters = vevents.filter((v) => !v.hasProperty("recurrence-id"));
    const exceptions = vevents.filter((v) => v.hasProperty("recurrence-id"));

    for (const master of masters) {
      const tzidParam: string | null = master.getFirstProperty("dtstart")?.getParameter("tzid") ?? null;
      let event: AnyIcal;
      try {
        event = new ICAL.Event(master, {
          exceptions: exceptions.filter((x) => x.getFirstPropertyValue("uid") === master.getFirstPropertyValue("uid")),
        });
      } catch {
        continue;
      }
      if (!event.startDate) continue;

      if (!event.isRecurring()) {
        if (isFree(master)) continue;
        const start = toDate(event.startDate, tzidParam, defaultTz);
        const end = event.endDate ? toDate(event.endDate, tzidParam, defaultTz) : start;
        push(start, end, event.startDate.isDate);
        continue;
      }

      const it = event.iterator();
      let next: AnyIcal;
      let count = 0;
      while ((next = it.next())) {
        if (++count > maxOcc) break;
        const details = event.getOccurrenceDetails(next);
        const occComp = details.item?.component ?? master;
        const occTzid = occComp.getFirstProperty("dtstart")?.getParameter("tzid") ?? tzidParam;
        const start = toDate(details.startDate, occTzid, defaultTz);
        if (start.getTime() >= rangeEnd) break;
        if (isFree(occComp)) continue;
        const end = toDate(details.endDate, occTzid, defaultTz);
        push(start, end, details.startDate.isDate);
      }
    }

    // Винятки без основної події в цьому ж об'єкті (буває при частковій відповіді сервера)
    const masterUids = new Set(masters.map((m) => m.getFirstPropertyValue("uid")));
    for (const ex of exceptions) {
      if (masterUids.has(ex.getFirstPropertyValue("uid")) || isFree(ex)) continue;
      const ev = new ICAL.Event(ex);
      const tzidParam = ex.getFirstProperty("dtstart")?.getParameter("tzid") ?? null;
      push(toDate(ev.startDate, tzidParam, defaultTz), toDate(ev.endDate ?? ev.startDate, tzidParam, defaultTz), ev.startDate.isDate);
    }
  }

  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

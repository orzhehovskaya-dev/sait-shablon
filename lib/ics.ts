/**
 * Генерація iCalendar (.ics): для події в iCloud та для вкладення в лист клієнту.
 */

export type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  alarmMinutesBefore?: number;
  method?: "PUBLISH" | "REQUEST";
  status?: "CONFIRMED" | "CANCELLED";
  sequence?: number;
};

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Перенесення довгих рядків (RFC 5545: до 75 октетів), не розриваючи UTF-8 символи */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = "";
      curBytes = 0;
      limit = 74; // наступні рядки починаються з пробілу
    }
    cur += ch;
    curBytes += b;
  }
  if (cur) out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(e: IcsEvent, now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Site//Booking//UK",
    "CALSCALE:GREGORIAN",
    `METHOD:${e.method ?? "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(e.start)}`,
    `DTEND:${utcStamp(e.end)}`,
    `SUMMARY:${escapeText(e.summary)}`,
    `STATUS:${e.status ?? "CONFIRMED"}`,
    `SEQUENCE:${e.sequence ?? 0}`,
    "TRANSP:OPAQUE",
  ];
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  if (e.alarmMinutesBefore && e.alarmMinutesBefore > 0) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(e.summary)}`,
      `TRIGGER:-PT${Math.round(e.alarmMinutesBefore)}M`,
      "END:VALARM",
    );
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Посилання «Додати в Google Calendar» */
export function googleCalendarUrl(e: Pick<IcsEvent, "start" | "end" | "summary" | "description" | "location">): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.summary,
    dates: `${utcStamp(e.start)}/${utcStamp(e.end)}`,
    details: e.description ?? "",
    location: e.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

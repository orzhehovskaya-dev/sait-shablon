import { test } from "node:test";
import assert from "node:assert/strict";
import { extractBusy } from "../lib/ical-busy.ts";
import { buildIcs, foldLine } from "../lib/ics.ts";

const range = { start: new Date("2026-10-19T00:00:00Z"), end: new Date("2026-11-02T00:00:00Z") };
const wrap = (body: string, tz = "") => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:test\r\n${tz}${body}END:VCALENDAR\r\n`;

const VTZ = `BEGIN:VTIMEZONE\r\nTZID:Europe/Kiev\r\nBEGIN:DAYLIGHT\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0300\r\nDTSTART:19700329T030000\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\nTZNAME:EEST\r\nEND:DAYLIGHT\r\nBEGIN:STANDARD\r\nTZOFFSETFROM:+0300\r\nTZOFFSETTO:+0200\r\nDTSTART:19701025T040000\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\nTZNAME:EET\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n`;

test("simple timed event with VTIMEZONE", () => {
  const ics = wrap(`BEGIN:VEVENT\r\nUID:a\r\nDTSTART;TZID=Europe/Kiev:20261020T140000\r\nDTEND;TZID=Europe/Kiev:20261020T150000\r\nSUMMARY:Зйомка\r\nEND:VEVENT\r\n`, VTZ);
  const b = extractBusy([ics], range, { allDayBlocks: true });
  assert.equal(b.length, 1);
  assert.equal(b[0].start.toISOString(), "2026-10-20T11:00:00.000Z");
  assert.equal(b[0].end.toISOString(), "2026-10-20T12:00:00.000Z");
});

test("TZID without VTIMEZONE falls back to IANA name", () => {
  const ics = wrap(`BEGIN:VEVENT\r\nUID:b\r\nDTSTART;TZID=Europe/Warsaw:20261020T140000\r\nDTEND;TZID=Europe/Warsaw:20261020T150000\r\nEND:VEVENT\r\n`);
  const b = extractBusy([ics], range, { allDayBlocks: true });
  assert.equal(b[0].start.toISOString(), "2026-10-20T12:00:00.000Z");
});

test("UTC event, transparent and cancelled events ignored", () => {
  const ics = wrap(
    `BEGIN:VEVENT\r\nUID:c\r\nDTSTART:20261021T090000Z\r\nDTEND:20261021T100000Z\r\nEND:VEVENT\r\n` +
      `BEGIN:VEVENT\r\nUID:d\r\nDTSTART:20261021T120000Z\r\nDTEND:20261021T130000Z\r\nTRANSP:TRANSPARENT\r\nEND:VEVENT\r\n` +
      `BEGIN:VEVENT\r\nUID:e\r\nDTSTART:20261021T140000Z\r\nDTEND:20261021T150000Z\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\n`,
  );
  const b = extractBusy([ics], range, { allDayBlocks: true });
  assert.equal(b.length, 1);
  assert.equal(b[0].start.toISOString(), "2026-10-21T09:00:00.000Z");
});

test("all-day events block whole Kyiv day (configurable)", () => {
  const ics = wrap(`BEGIN:VEVENT\r\nUID:f\r\nDTSTART;VALUE=DATE:20261022\r\nDTEND;VALUE=DATE:20261023\r\nSUMMARY:Відпустка\r\nEND:VEVENT\r\n`);
  const b = extractBusy([ics], range, { allDayBlocks: true });
  assert.equal(b[0].start.toISOString(), "2026-10-21T21:00:00.000Z");
  assert.equal(b[0].end.toISOString(), "2026-10-22T21:00:00.000Z");
  assert.equal(extractBusy([ics], range, { allDayBlocks: false }).length, 0);
});

test("weekly recurring event with an exception and EXDATE", () => {
  const ics = wrap(
    `BEGIN:VEVENT\r\nUID:r1\r\nDTSTART;TZID=Europe/Kiev:20261005T100000\r\nDTEND;TZID=Europe/Kiev:20261005T110000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO\r\nEXDATE;TZID=Europe/Kiev:20261026T100000\r\nEND:VEVENT\r\n` +
      `BEGIN:VEVENT\r\nUID:r1\r\nRECURRENCE-ID;TZID=Europe/Kiev:20261019T100000\r\nDTSTART;TZID=Europe/Kiev:20261019T160000\r\nDTEND;TZID=Europe/Kiev:20261019T170000\r\nEND:VEVENT\r\n`,
    VTZ,
  );
  const b = extractBusy([ics], range, { allDayBlocks: true });
  const starts = b.map((x) => x.start.toISOString());
  // 19.10 перенесено на 16:00 (UTC 13:00), 26.10 виключено, 05.10 і 12.10 — поза діапазоном
  assert.deepEqual(starts, ["2026-10-19T13:00:00.000Z"]);
});

test("recurring event across DST keeps local time", () => {
  const ics = wrap(
    `BEGIN:VEVENT\r\nUID:r2\r\nDTSTART;TZID=Europe/Kiev:20261020T100000\r\nDTEND;TZID=Europe/Kiev:20261020T110000\r\nRRULE:FREQ=WEEKLY;COUNT=2\r\nEND:VEVENT\r\n`,
    VTZ,
  );
  const b = extractBusy([ics], range, { allDayBlocks: true });
  assert.deepEqual(
    b.map((x) => x.start.toISOString()),
    ["2026-10-20T07:00:00.000Z", "2026-10-27T08:00:00.000Z"],
  );
});

test("broken calendar object does not break others", () => {
  const good = wrap(`BEGIN:VEVENT\r\nUID:g\r\nDTSTART:20261021T090000Z\r\nDTEND:20261021T100000Z\r\nEND:VEVENT\r\n`);
  const b = extractBusy(["BEGIN:VCALENDAR\r\ngarbage", good], range, { allDayBlocks: true });
  assert.equal(b.length, 1);
});

test("generated ICS is valid and folds long UTF-8 lines", () => {
  const ics = buildIcs(
    {
      uid: "booking-1@site",
      start: new Date("2026-10-25T12:00:00Z"),
      end: new Date("2026-10-25T13:00:00Z"),
      summary: "Особиста консультація — Анна Коваленко, дуже довга назва події для перевірки перенесення рядків",
      description: "Рядок 1\nРядок 2; кома, тест",
      alarmMinutesBefore: 30,
    },
    new Date("2026-10-18T00:00:00Z"),
  );
  assert.ok(ics.includes("DTSTART:20261025T120000Z"));
  assert.ok(ics.replace(/\r\n /g, "").includes("DESCRIPTION:Рядок 1\\nРядок 2\\; кома\\, тест"));
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  // Згенерований файл читається нашим же парсером
  const b = extractBusy([ics], range, { allDayBlocks: true });
  assert.equal(b[0].start.toISOString(), "2026-10-25T12:00:00.000Z");
  assert.equal(foldLine("short"), "short");
});

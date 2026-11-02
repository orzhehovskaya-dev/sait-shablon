import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSlots, conflicts, isSlotBookable, normalizeSettings, DEFAULT_SETTINGS } from "../lib/slots.ts";
import { zonedToUtc, dateKey, timeKey, tzOffsetMinutes, weekdayOf, addDays } from "../lib/time.ts";

const settings = { ...DEFAULT_SETTINGS, minNoticeMin: 0, horizonDays: 60 };

test("Kyiv timezone conversion handles summer and winter time", () => {
  // 25.10.2026 (неділя) — ще літній час? Перехід 25.10.2026 о 04:00 → 03:00
  assert.equal(zonedToUtc("2026-07-01", "14:00").toISOString(), "2026-07-01T11:00:00.000Z");
  assert.equal(zonedToUtc("2026-12-01", "14:00").toISOString(), "2026-12-01T12:00:00.000Z");
  assert.equal(tzOffsetMinutes(new Date("2026-07-01T00:00:00Z")), 180);
  assert.equal(tzOffsetMinutes(new Date("2026-12-01T00:00:00Z")), 120);
  assert.equal(dateKey(new Date("2026-10-18T21:30:00Z")), "2026-10-19");
  assert.equal(timeKey(new Date("2026-10-18T21:30:00Z")), "00:30");
  assert.equal(weekdayOf("2026-10-19"), 1);
  assert.equal(weekdayOf("2026-10-25"), 7);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("slots respect working hours and duration", () => {
  const now = new Date("2026-10-18T06:00:00Z");
  const days = computeSlots({ settings, durationMin: 60, fromDate: "2026-10-19", days: 1, blockedDates: new Set(), busy: [], now });
  const times = days[0].slots.map((s) => s.time);
  assert.equal(times[0], "10:00");
  assert.equal(times.at(-1), "18:00"); // 18:00 + 60 хв = 19:00
  assert.equal(times.length, 17);
});

test("weekends closed and blocked dates skipped", () => {
  const now = new Date("2026-10-18T06:00:00Z");
  const days = computeSlots({ settings, durationMin: 30, fromDate: "2026-10-24", days: 3, blockedDates: new Set(["2026-10-26"]), busy: [], now });
  assert.deepEqual(days.map((d) => d.slots.length), [0, 0, 0]);
});

test("30-minute buffer around calendar events", () => {
  const now = new Date("2026-10-18T06:00:00Z");
  const busy = [{ start: zonedToUtc("2026-10-19", "13:00"), end: zonedToUtc("2026-10-19", "14:00") }];
  const days = computeSlots({ settings, durationMin: 60, fromDate: "2026-10-19", days: 1, blockedDates: new Set(), busy, now });
  const times = days[0].slots.map((s) => s.time);
  assert.ok(times.includes("11:30")); // 11:30–12:30, перерва до 13:00
  assert.ok(!times.includes("12:00")); // закінчується о 13:00 — без перерви
  assert.ok(!times.includes("14:00")); // одразу після події
  assert.ok(times.includes("14:30")); // перерва 30 хв
});

test("120-minute strategy needs a 2-hour window", () => {
  const now = new Date("2026-10-18T06:00:00Z");
  const days = computeSlots({ settings, durationMin: 120, fromDate: "2026-10-23", days: 1, blockedDates: new Set(), busy: [], now });
  assert.equal(days[0].slots.at(-1)!.time, "15:00"); // п'ятниця до 17:00
});

test("minimum notice and horizon", () => {
  const now = zonedToUtc("2026-10-19", "09:00");
  const s = { ...settings, minNoticeMin: 24 * 60, horizonDays: 3 };
  const days = computeSlots({ settings: s, durationMin: 30, fromDate: "2026-10-19", days: 10, blockedDates: new Set(), busy: [], now });
  assert.equal(days[0].slots.length, 0); // сьогодні — менше 24 год
  assert.equal(days[1].slots[0].time, "10:00"); // завтра після 09:00+24h
  assert.equal(days.length, 4); // горизонт 3 дні (сьогодні + 3)
});

test("conflicts() is symmetric with buffer", () => {
  const b = [{ start: new Date("2026-10-19T10:00:00Z"), end: new Date("2026-10-19T11:00:00Z") }];
  assert.equal(conflicts(new Date("2026-10-19T11:30:00Z"), 60, 30, b), false);
  assert.equal(conflicts(new Date("2026-10-19T11:29:00Z"), 60, 30, b), true);
  assert.equal(conflicts(new Date("2026-10-19T08:30:00Z"), 60, 30, b), false);
  assert.equal(conflicts(new Date("2026-10-19T08:31:00Z"), 60, 30, b), true);
});

test("isSlotBookable rejects tampered times", () => {
  const now = new Date("2026-10-18T06:00:00Z");
  const base = { settings, durationMin: 60, blockedDates: new Set<string>(), busy: [], now };
  assert.equal(isSlotBookable(zonedToUtc("2026-10-19", "10:00"), base), true);
  assert.equal(isSlotBookable(zonedToUtc("2026-10-19", "10:10"), base), false); // не на кроці
  assert.equal(isSlotBookable(zonedToUtc("2026-10-19", "21:00"), base), false); // поза годинами
  assert.equal(isSlotBookable(zonedToUtc("2026-10-25", "10:00"), base), false); // неділя
});

test("DST day: 25.10.2026 has correct UTC times", () => {
  const s = { ...settings, weeklyHours: { ...settings.weeklyHours, "7": [{ start: "10:00", end: "12:00" }] } };
  const now = new Date("2026-10-18T06:00:00Z");
  const days = computeSlots({ settings: s, durationMin: 60, fromDate: "2026-10-25", days: 1, blockedDates: new Set(), busy: [], now });
  assert.equal(days[0].slots[0].start, "2026-10-25T08:00:00.000Z"); // після переходу UTC+2
});

test("normalizeSettings rejects broken values", () => {
  const n = normalizeSettings({ bufferMin: -5, stepMin: 7, weeklyHours: { "1": [{ start: "19:00", end: "10:00" }] } as never });
  assert.equal(n.bufferMin, 0);
  assert.equal(n.stepMin, 15);
  assert.deepEqual(n.weeklyHours["1"], []);
});

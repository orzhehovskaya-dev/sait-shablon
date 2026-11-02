/**
 * Розрахунок вільних слотів. Чиста функція — без мережі та бази, покрита тестами.
 */
import { addDays, dateKey, minutesOf, weekdayOf, zonedToUtc, TZ } from "./time.ts";

export type Interval = { start: Date; end: Date };

/** Робочі години по днях тижня: ключ 1 (пн) … 7 (нд), значення — інтервали «HH:mm» */
export type WeeklyHours = Record<string, { start: string; end: string }[]>;

export type AvailabilitySettings = {
  weeklyHours: WeeklyHours;
  bufferMin: number; // перерва між зустрічами
  stepMin: number; // крок початку слотів
  minNoticeMin: number; // мінімум часу до зустрічі
  horizonDays: number; // на скільки днів уперед відкрите бронювання
};

export const DEFAULT_SETTINGS: AvailabilitySettings = {
  weeklyHours: {
    "1": [{ start: "10:00", end: "19:00" }],
    "2": [{ start: "10:00", end: "19:00" }],
    "3": [{ start: "10:00", end: "19:00" }],
    "4": [{ start: "10:00", end: "19:00" }],
    "5": [{ start: "10:00", end: "17:00" }],
    "6": [],
    "7": [],
  },
  bufferMin: 30,
  stepMin: 30,
  minNoticeMin: 24 * 60,
  horizonDays: 30,
};

export type SlotInput = {
  settings: AvailabilitySettings;
  durationMin: number;
  /** Перша дата діапазону (YYYY-MM-DD, київський час) */
  fromDate: string;
  /** Кількість днів діапазону */
  days: number;
  blockedDates: Set<string>;
  /** Зайнятий час: події календаря та інші бронювання (реальна тривалість, без перерви) */
  busy: Interval[];
  now: Date;
  tz?: string;
};

export type Slot = { start: string; end: string; time: string };
export type DaySlots = { date: string; slots: Slot[] };

/** Чи перетинається зустріч [start, start+duration) з зайнятим інтервалом з урахуванням перерви з обох боків */
export function conflicts(start: Date, durationMin: number, bufferMin: number, busy: Interval[]): boolean {
  const s = start.getTime();
  const e = s + durationMin * 60000;
  const buf = bufferMin * 60000;
  for (const b of busy) {
    if (s < b.end.getTime() + buf && e + buf > b.start.getTime()) return true;
  }
  return false;
}

export function computeSlots(input: SlotInput): DaySlots[] {
  const tz = input.tz ?? TZ;
  const { settings, durationMin } = input;
  const earliest = input.now.getTime() + settings.minNoticeMin * 60000;
  const lastDate = addDays(dateKey(input.now, tz), settings.horizonDays);
  const busy = [...input.busy].sort((a, b) => a.start.getTime() - b.start.getTime());

  const result: DaySlots[] = [];
  for (let i = 0; i < input.days; i++) {
    const date = addDays(input.fromDate, i);
    if (date > lastDate) break;
    const day: DaySlots = { date, slots: [] };
    result.push(day);
    if (input.blockedDates.has(date)) continue;

    const windows = settings.weeklyHours[String(weekdayOf(date))] ?? [];
    for (const w of windows) {
      const winStart = minutesOf(w.start);
      const winEnd = minutesOf(w.end);
      for (let m = winStart; m + durationMin <= winEnd; m += settings.stepMin) {
        const hh = String(Math.floor(m / 60)).padStart(2, "0");
        const mm = String(m % 60).padStart(2, "0");
        const time = `${hh}:${mm}`;
        const start = zonedToUtc(date, time, tz);
        // пропускаємо неіснуючий час (перехід на літній час)
        if (dateKey(start, tz) !== date) continue;
        if (start.getTime() < earliest) continue;
        if (conflicts(start, durationMin, settings.bufferMin, busy)) continue;
        day.slots.push({
          start: start.toISOString(),
          end: new Date(start.getTime() + durationMin * 60000).toISOString(),
          time,
        });
      }
    }
  }
  return result;
}

/** Перевірка конкретного слоту перед створенням бронювання (ті самі правила, що й у списку) */
export function isSlotBookable(
  start: Date,
  input: Omit<SlotInput, "fromDate" | "days">,
): boolean {
  const tz = input.tz ?? TZ;
  const date = dateKey(start, tz);
  const days = computeSlots({ ...input, fromDate: date, days: 1 });
  return days[0]?.slots.some((s) => s.start === start.toISOString()) ?? false;
}

/** Нормалізує налаштування з бази (захист від некоректних значень з адмінки) */
export function normalizeSettings(raw: Partial<AvailabilitySettings> | null | undefined): AvailabilitySettings {
  const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  if (!s.weeklyHours || typeof s.weeklyHours !== "object") s.weeklyHours = DEFAULT_SETTINGS.weeklyHours;
  const clamp = (v: unknown, min: number, max: number, def: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
  };
  const weeklyHours: WeeklyHours = {};
  for (let d = 1; d <= 7; d++) {
    const list = Array.isArray(s.weeklyHours?.[String(d)]) ? s.weeklyHours[String(d)] : [];
    weeklyHours[String(d)] = list.filter(
      (w) => /^\d{2}:\d{2}$/.test(w?.start) && /^\d{2}:\d{2}$/.test(w?.end) && minutesOf(w.end) > minutesOf(w.start),
    );
  }
  return {
    weeklyHours,
    bufferMin: clamp(s.bufferMin, 0, 240, DEFAULT_SETTINGS.bufferMin),
    stepMin: clamp(s.stepMin, 15, 120, DEFAULT_SETTINGS.stepMin),
    minNoticeMin: clamp(s.minNoticeMin, 0, 60 * 24 * 14, DEFAULT_SETTINGS.minNoticeMin),
    horizonDays: clamp(s.horizonDays, 1, 180, DEFAULT_SETTINGS.horizonDays),
  };
}

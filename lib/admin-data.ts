import "server-only";
import { db } from "./supabase/admin.ts";
import { zonedToUtc, addDays, isValidDateKey } from "./time.ts";
import { services } from "../content/services.ts";
import type { BookingRow, BookingStatus } from "./booking-service.ts";

export type Filters = {
  q: string;
  from: string; // дата зустрічі від (YYYY-MM-DD)
  to: string; // дата зустрічі до (включно)
  service: string;
  status: "" | "paid" | "unpaid" | BookingStatus;
};

export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const g = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const status = g("status");
  return {
    q: g("q").slice(0, 80),
    from: isValidDateKey(g("from")) ? g("from") : "",
    to: isValidDateKey(g("to")) ? g("to") : "",
    service: services.some((s) => s.slug === g("service")) ? g("service") : "",
    status: (["", "paid", "unpaid", "pending_payment", "failed", "expired", "cancelled", "refunded", "conflict"].includes(status) ? status : "") as Filters["status"],
  };
}

export function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => v && p.set(k, v));
  return p.toString();
}

export async function listBookings(f: Filters, limit = 500): Promise<BookingRow[]> {
  let q = db().from("bookings").select("*").order("starts_at", { ascending: false }).limit(limit);
  if (f.from) q = q.gte("starts_at", zonedToUtc(f.from, "00:00").toISOString());
  if (f.to) q = q.lt("starts_at", zonedToUtc(addDays(f.to, 1), "00:00").toISOString());
  if (f.service) q = q.eq("service_slug", f.service);
  if (f.status === "paid") q = q.eq("status", "paid");
  else if (f.status === "unpaid") q = q.in("status", ["pending_payment", "failed", "expired"]);
  else if (f.status) q = q.eq("status", f.status);
  if (f.q) {
    const term = f.q.replace(/[%,()"'\\]/g, " ").trim();
    if (term) {
      const like = `%${term}%`;
      q = q.or(`full_name.ilike.${like},email.ilike.${like},instagram.ilike.${like},contact.ilike.${like},order_reference.ilike.${like}`);
    }
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as BookingRow[];
}

/** Виручка в євро: оплачені бронювання мінус повернення (повернення перераховано пропорційно) */
export function revenueEur(b: BookingRow): number {
  if (!["paid", "refunded", "conflict", "cancelled"].includes(b.status) || !b.paid_at) return 0;
  const price = Number(b.price_eur);
  const charged = Number(b.charge_amount) || price;
  const refundedEur = (Number(b.refunded_amount) / charged) * price;
  return Math.max(0, Math.round((price - refundedEur) * 100) / 100);
}

export function stats(rows: BookingRow[]) {
  const byService = Object.fromEntries(services.map((s) => [s.slug, { name: s.name, revenue: 0, count: 0 }]));
  let revenue = 0;
  let paid = 0;
  let upcoming = 0;
  const now = Date.now();
  for (const b of rows) {
    const r = revenueEur(b);
    revenue += r;
    if (b.status === "paid") {
      paid++;
      if (new Date(b.starts_at).getTime() > now) upcoming++;
    }
    if (byService[b.service_slug] && r > 0) {
      byService[b.service_slug].revenue += r;
      byService[b.service_slug].count++;
    }
  }
  const applications = rows.length;
  return { revenue, paid, upcoming, applications, conversion: applications ? Math.round((paid / applications) * 100) : 0, byService };
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending_payment: "Очікує оплату",
  paid: "Оплачено",
  failed: "Оплата не пройшла",
  expired: "Час на оплату минув",
  cancelled: "Скасовано",
  refunded: "Повернено",
  conflict: "Конфлікт часу",
};

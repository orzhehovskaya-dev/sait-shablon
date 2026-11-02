"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { authClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/admin";
import { cancelBooking, refundBooking, resendConfirmation, fulfil, BookingError } from "@/lib/booking-service";
import { normalizeSettings } from "@/lib/slots";
import { isValidDateKey, isValidTime } from "@/lib/time";

function back(id: string, msg: string, error = false): never {
  redirect(`/admin/bookings/${id}?${error ? "error" : "ok"}=${encodeURIComponent(msg)}`);
}

function errMsg(e: unknown) {
  return e instanceof BookingError ? e.message : `Помилка: ${(e as Error).message}`;
}

export async function refundAction(formData: FormData) {
  await requireAdmin("owner");
  const id = String(formData.get("id"));
  const amountRaw = String(formData.get("amount") ?? "").replace(",", ".");
  const amount = amountRaw ? Number(amountRaw) : undefined;
  if (formData.get("confirm") !== "on") back(id, "Підтверди повернення галочкою", true);
  const msg = "Кошти повернуто";
  try {
    await refundBooking(id, {
      amount: amount && amount > 0 ? amount : undefined,
      comment: String(formData.get("comment") ?? ""),
      notifyClient: formData.get("notify") === "on",
    });
  } catch (e) {
    back(id, errMsg(e), true);
  }
  revalidatePath("/admin");
  back(id, msg);
}

export async function cancelAction(formData: FormData) {
  await requireAdmin("owner");
  const id = String(formData.get("id"));
  if (formData.get("confirm") !== "on") back(id, "Підтверди скасування галочкою", true);
  try {
    await cancelBooking(id, { notifyClient: formData.get("notify") === "on" });
  } catch (e) {
    back(id, errMsg(e), true);
  }
  revalidatePath("/admin");
  back(id, "Бронювання скасовано, подію в календарі та Zoom видалено");
}

export async function resendAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  try {
    await resendConfirmation(id);
  } catch (e) {
    back(id, errMsg(e), true);
  }
  back(id, "Лист-підтвердження надіслано ще раз");
}

export async function retryFulfilmentAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  try {
    await fulfil(id);
  } catch (e) {
    back(id, errMsg(e), true);
  }
  back(id, "Повторну обробку виконано — перевір статуси кроків");
}

export async function noteAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  await db().from("bookings").update({ admin_note: String(formData.get("note") ?? "").slice(0, 4000) }).eq("id", id);
  back(id, "Нотатку збережено");
}

export async function saveSettingsAction(formData: FormData) {
  await requireAdmin("owner");
  const weekly: Record<string, { start: string; end: string }[]> = {};
  for (let d = 1; d <= 7; d++) {
    const on = formData.get(`on${d}`) === "on";
    const s = String(formData.get(`start${d}`) ?? "");
    const e = String(formData.get(`end${d}`) ?? "");
    weekly[String(d)] = on && isValidTime(s) && isValidTime(e) && e > s ? [{ start: s, end: e }] : [];
  }
  const n = normalizeSettings({
    weeklyHours: weekly,
    bufferMin: Number(formData.get("bufferMin")),
    stepMin: Number(formData.get("stepMin")),
    minNoticeMin: Number(formData.get("minNoticeHours")) * 60,
    horizonDays: Number(formData.get("horizonDays")),
  });
  const { error } = await db()
    .from("availability_settings")
    .upsert({
      id: 1,
      weekly_hours: n.weeklyHours,
      buffer_min: n.bufferMin,
      step_min: n.stepMin,
      min_notice_min: n.minNoticeMin,
      horizon_days: n.horizonDays,
      updated_at: new Date().toISOString(),
    });
  redirect(`/admin/settings?${error ? "error=" + encodeURIComponent(error.message) : "ok=" + encodeURIComponent("Розклад збережено")}`);
}

export async function addBlockedAction(formData: FormData) {
  await requireAdmin("owner");
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "") || from;
  const note = String(formData.get("note") ?? "").slice(0, 200);
  if (!isValidDateKey(from) || !isValidDateKey(to) || to < from) redirect("/admin/settings?error=" + encodeURIComponent("Перевір дати"));
  const rows: { date: string; note: string }[] = [];
  let d = from;
  while (d <= to && rows.length < 366) {
    rows.push({ date: d, note });
    const [y, m, day] = d.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, day + 1));
    d = t.toISOString().slice(0, 10);
  }
  const { error } = await db().from("blocked_dates").upsert(rows);
  redirect(`/admin/settings?${error ? "error=" + encodeURIComponent(error.message) : "ok=" + encodeURIComponent("Дні заблоковано")}`);
}

export async function removeBlockedAction(formData: FormData) {
  await requireAdmin("owner");
  const date = String(formData.get("date") ?? "");
  if (isValidDateKey(date)) await db().from("blocked_dates").delete().eq("date", date);
  redirect("/admin/settings?ok=" + encodeURIComponent("День розблоковано"));
}

export async function signOutAction() {
  const supa = await authClient();
  await supa.auth.signOut();
  redirect("/admin/login");
}

export async function runCheckAction(formData: FormData) {
  const admin = await requireAdmin("owner");
  const { runCheck, CHECKS } = await import("@/lib/diagnostics");
  const name = String(formData.get("name"));
  if (!CHECKS.some((c) => c.name === name)) redirect("/admin/status");
  await runCheck(name as Parameters<typeof runCheck>[0], admin.email);
  redirect(`/admin/status#${name}`);
}


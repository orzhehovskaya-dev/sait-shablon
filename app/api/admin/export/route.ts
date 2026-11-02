import { type NextRequest } from "next/server";
import { getAdmin } from "@/lib/admin-auth";
import { listBookings, parseFilters, revenueEur, STATUS_LABEL } from "@/lib/admin-data";
import { formatDateNumeric, timeKey } from "@/lib/time";

export const dynamic = "force-dynamic";

function cell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // захист від формул у Excel / Numbers
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const admin = await getAdmin();
  if (!admin) return new Response("Unauthorized", { status: 401 });

  const f = parseFilters(Object.fromEntries(req.nextUrl.searchParams.entries()));
  const rows = await listBookings(f, 5000);

  const header = [
    "Номер", "Статус", "Послуга", "Дата", "Час (Київ)", "Ціна €", "Виручка €", "Списано", "Валюта", "Повернено",
    "Ім'я", "Email", "Контакт", "Instagram", "TikTok", "YouTube", "Сайт", "Інші мережі",
    "Чим займається", "Запит", "Бажаний результат", "Запитання",
    "Продукти", "Середній чек", "Проблеми із залученням", "Ціль 3 міс",
    "Створено", "Оплачено", "UTM",
  ];
  const lines = [header.map(cell).join(",")];
  for (const b of rows) {
    const s = new Date(b.starts_at);
    lines.push(
      [
        b.order_reference, STATUS_LABEL[b.status], b.service_name, formatDateNumeric(s), timeKey(s), b.price_eur, revenueEur(b),
        b.charge_amount, b.charge_currency, b.refunded_amount,
        b.full_name, b.email, b.contact, b.instagram, b.socials?.tiktok, b.socials?.youtube, b.socials?.website,
        (b.socials?.other ?? []).map((o) => `${o.label}: ${o.url}`).join("; "),
        b.occupation, b.main_request, b.desired_result, b.questions,
        b.strategy?.products, b.strategy?.averageCheck, b.strategy?.acquisitionProblems, b.strategy?.goal3m,
        b.created_at, b.paid_at, b.utm ? Object.entries(b.utm).map(([k, v]) => `${k}=${v}`).join("&") : "",
      ]
        .map(cell)
        .join(","),
    );
  }
  // BOM — щоб Excel коректно показав кирилицю
  const csv = "﻿" + lines.join("\r\n");
  const name = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { getByToken, syncPaymentStatus } from "@/lib/booking-service";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Статус бронювання для сторінки результату. Віддає лише те, що потрібно показати клієнту. */
export async function GET(req: NextRequest) {
  if (!rateLimit(`st:${clientIp(req.headers)}`, 120, 60_000)) {
    return NextResponse.json({ error: "Забагато запитів" }, { status: 429 });
  }
  const token = req.nextUrl.searchParams.get("t") ?? "";
  let b = await getByToken(token);
  if (!b) return NextResponse.json({ error: "Бронювання не знайдено" }, { status: 404 });

  // Якщо сповіщення від WayForPay ще не прийшло — сервер сам перевіряє статус платежу
  if (b.status === "pending_payment" && req.nextUrl.searchParams.get("check") === "1" && rateLimit(`chk:${token}`, 1, 4000)) {
    try {
      b = await syncPaymentStatus(b);
    } catch (e) {
      console.error("[status] sync", e);
    }
  }

  return NextResponse.json(
    {
      status: b.status,
      service: b.service_slug,
      serviceName: b.service_name,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      priceEur: Number(b.price_eur),
      holdExpiresAt: b.hold_expires_at,
      email: b.status === "paid" ? b.email.replace(/^(.{2}).*(@.*)$/, "$1•••$2") : undefined,
      zoomReady: Boolean(b.zoom_join_url),
      emailSent: Boolean(b.confirmation_sent_at),
      questionnaireDone: Boolean(b.questionnaire_at),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

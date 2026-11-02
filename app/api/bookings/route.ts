import { NextResponse, type NextRequest } from "next/server";
import { getService } from "@/content/services";
import { createBooking, BookingError } from "@/lib/booking-service";
import { validateForm } from "@/lib/validation";
import { ConfigError } from "@/lib/env";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`bk:${ip}`, 8, 10 * 60_000)) {
    return NextResponse.json({ error: "Забагато спроб. Спробуй за кілька хвилин." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }

  // Пастка для ботів: поле, яке людина не бачить
  if (typeof body.company === "string" && body.company.trim()) {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }

  const service = getService(String(body.service ?? ""));
  if (!service) return NextResponse.json({ error: "Невідома послуга" }, { status: 400 });

  const v = validateForm(body.form, { extended: service.extendedForm, stage: "contact" });
  if (!v.ok) return NextResponse.json({ error: "Перевір анкету", fields: v.errors }, { status: 422 });

  const utmRaw = (body.utm && typeof body.utm === "object" ? body.utm : {}) as Record<string, unknown>;
  const utm = Object.fromEntries(
    UTM_KEYS.filter((k) => typeof utmRaw[k] === "string").map((k) => [k, String(utmRaw[k]).slice(0, 120)]),
  );

  try {
    const { booking, payment } = await createBooking({
      service,
      startIso: String(body.start ?? ""),
      form: v.data,
      utm: Object.keys(utm).length ? utm : null,
    });
    return NextResponse.json({ token: booking.public_token, holdExpiresAt: booking.hold_expires_at, payment });
  } catch (e) {
    if (e instanceof BookingError) {
      const status = e.code === "slot_taken" ? 409 : e.code === "calendar_unavailable" || e.code === "payment_config" ? 503 : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    if (e instanceof ConfigError) {
      console.error("[bookings] config", e.message);
      return NextResponse.json({ error: "Онлайн-бронювання ще не підключено.", code: "not_configured" }, { status: 503 });
    }
    console.error("[bookings]", e);
    return NextResponse.json({ error: "Не вдалося створити бронювання. Спробуй ще раз." }, { status: 500 });
  }
}

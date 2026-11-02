import { NextResponse, type NextRequest } from "next/server";
import { getService } from "@/content/services";
import { getAvailability, BookingError } from "@/lib/booking-service";
import { dateKey, isValidDateKey } from "@/lib/time";
import { ConfigError } from "@/lib/env";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!rateLimit(`av:${clientIp(req.headers)}`, 60, 60_000)) {
    return NextResponse.json({ error: "Забагато запитів. Спробуй за хвилину." }, { status: 429 });
  }
  const sp = req.nextUrl.searchParams;
  const service = getService(sp.get("service") ?? "");
  if (!service) return NextResponse.json({ error: "Невідома послуга" }, { status: 400 });

  const from = sp.get("from") ?? dateKey(new Date());
  if (!isValidDateKey(from)) return NextResponse.json({ error: "Некоректна дата" }, { status: 400 });
  const days = Math.min(42, Math.max(1, Number(sp.get("days") ?? 14) || 14));

  try {
    const result = await getAvailability(service, from, days);
    return NextResponse.json({ days: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof BookingError && e.code === "calendar_unavailable") {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 503 });
    }
    if (e instanceof ConfigError) {
      console.error("[availability] config", e.message);
      return NextResponse.json({ error: "Онлайн-бронювання ще не підключено.", code: "not_configured" }, { status: 503 });
    }
    console.error("[availability]", e);
    return NextResponse.json({ error: "Не вдалося завантажити розклад. Спробуй ще раз." }, { status: 500 });
  }
}

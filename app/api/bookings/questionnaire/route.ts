import { NextResponse, type NextRequest } from "next/server";
import { getByToken, saveQuestionnaire, BookingError } from "@/lib/booking-service";
import { getService } from "@/content/services";
import { validateForm } from "@/lib/validation";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Анкета після оплати. Доступ — лише за секретним токеном бронювання з листа / сторінки результату. */
export async function POST(req: NextRequest) {
  if (!rateLimit(`q:${clientIp(req.headers)}`, 10, 10 * 60_000)) {
    return NextResponse.json({ error: "Забагато спроб. Спробуй за кілька хвилин." }, { status: 429 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }
  const token = String(body.token ?? "");
  const b = await getByToken(token);
  if (!b) return NextResponse.json({ error: "Бронювання не знайдено" }, { status: 404 });
  const service = getService(b.service_slug);
  const v = validateForm(body.form, { extended: Boolean(service?.extendedForm), stage: "questionnaire" });
  if (!v.ok) return NextResponse.json({ error: "Перевір анкету", fields: v.errors }, { status: 422 });
  try {
    await saveQuestionnaire(token, v.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[questionnaire]", e);
    return NextResponse.json({ error: "Не вдалося зберегти анкету. Спробуй ще раз." }, { status: 500 });
  }
}

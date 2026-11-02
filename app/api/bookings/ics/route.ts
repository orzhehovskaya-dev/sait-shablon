import { type NextRequest } from "next/server";
import { getByToken, clientIcs } from "@/lib/booking-service";

export const dynamic = "force-dynamic";

/** Файл .ics для додавання зустрічі в календар (посилання з листа) */
export async function GET(req: NextRequest) {
  const b = await getByToken(req.nextUrl.searchParams.get("t") ?? "");
  if (!b || b.status !== "paid") return new Response("Зустріч не знайдено", { status: 404 });
  return new Response(clientIcs(b), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="zustrich.ics"',
      "Cache-Control": "no-store",
    },
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runScheduledTick } from "@/lib/booking-service";
import { safeEqualHex } from "@/lib/wayforpay";
import { saveCheck } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Планувальник: запускати кожні 10–15 хвилин.
 * Vercel Cron автоматично додає заголовок Authorization: Bearer <CRON_SECRET>.
 * Для зовнішнього сервісу (cron-job.org) додай такий самий заголовок.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.cronSecret()}`;
  if (!safeEqualHex(auth, expected)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const report = await runScheduledTick();
  if (report.errors.length) console.error("[cron]", report.errors);
  await saveCheck("cron", {
    ok: report.errors.length === 0,
    detail: `Останній запуск: звільнено ${report.expired}, перевірено платежів ${report.synced}, нагадувань ${report.reminders}${report.errors.length ? `. Помилки: ${report.errors.join("; ")}` : ""}`,
  }).catch(() => {});
  return NextResponse.json(report);
}

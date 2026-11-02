import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * returnUrl: сюди браузер клієнта повертається з платіжної сторінки (WayForPay робить POST).
 * Тут НІЧОГО не підтверджуємо — лише переадресовуємо на сторінку результату,
 * яка показує справжній статус із бази.
 */
function redirect(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const safe = /^[a-f0-9]{48}$/.test(t) ? t : "";
  return NextResponse.redirect(`${env.siteUrl()}/booking/result?t=${safe}`, 303);
}

export const POST = redirect;
export const GET = redirect;

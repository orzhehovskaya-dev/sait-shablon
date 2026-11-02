import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { applyTransaction } from "@/lib/booking-service";
import { buildAcceptResponse, parseCallbackBody, verifyTransaction } from "@/lib/wayforpay";
import { db } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * serviceUrl: WayForPay надсилає сюди результат кожної транзакції.
 * Бронювання підтверджується ЛИШЕ тут (або через серверний CHECK_STATUS) — після перевірки підпису.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const tx = parseCallbackBody(raw);
  if (!tx) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const w = env.wayforpay();
  const cfg = { merchantAccount: w.merchantAccount, secretKey: w.secretKey, merchantDomainName: w.merchantDomainName };

  if (!verifyTransaction(tx, cfg)) {
    await db()
      .from("payment_events")
      .insert({ order_reference: String(tx.orderReference ?? ""), source: "callback", transaction_status: tx.transactionStatus ?? null, signature_valid: false, payload: { orderReference: tx.orderReference, transactionStatus: tx.transactionStatus } });
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  try {
    await applyTransaction(tx, "callback");
  } catch (e) {
    // Не підтверджуємо отримання — WayForPay повторить сповіщення пізніше
    console.error("[wayforpay callback]", e);
    return NextResponse.json({ error: "processing error" }, { status: 500 });
  }

  return NextResponse.json(buildAcceptResponse(tx.orderReference, w.secretKey));
}

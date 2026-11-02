/**
 * WayForPay: підписи, параметри платежу, перевірка статусу, повернення.
 * Лише серверний код — секретний ключ ніколи не потрапляє в браузер.
 * Документація: https://wiki.wayforpay.com/
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const WFP_PAY_URL = "https://secure.wayforpay.com/pay";
export const WFP_API_URL = "https://api.wayforpay.com/api";

export type WfpConfig = {
  merchantAccount: string;
  secretKey: string;
  merchantDomainName: string;
};

export function hmacMd5(parts: (string | number)[], secret: string): string {
  return createHmac("md5", secret).update(parts.map(String).join(";"), "utf8").digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Сума у форматі WayForPay: число з двома знаками, без зайвих нулів у підписі */
export function formatAmount(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

export type PurchaseOrder = {
  orderReference: string;
  orderDate: number; // unix seconds
  amount: number;
  currency: string;
  productName: string;
  returnUrl: string;
  serviceUrl: string;
  clientFirstName?: string;
  clientLastName?: string;
  clientEmail?: string;
  /** Через скільки секунд платіж стає недійсним — дорівнює часу утримання слота */
  orderTimeout: number;
  language?: "UA" | "EN" | "AUTO";
};

/** Поля для форми, яку браузер відправляє POST-запитом на secure.wayforpay.com/pay */
export function buildPurchaseFields(cfg: WfpConfig, o: PurchaseOrder): Record<string, string> {
  const amount = formatAmount(o.amount);
  const signature = hmacMd5(
    [cfg.merchantAccount, cfg.merchantDomainName, o.orderReference, o.orderDate, amount, o.currency, o.productName, 1, amount],
    cfg.secretKey,
  );
  const fields: Record<string, string> = {
    merchantAccount: cfg.merchantAccount,
    merchantAuthType: "SimpleSignature",
    merchantDomainName: cfg.merchantDomainName,
    merchantTransactionSecureType: "AUTO",
    merchantSignature: signature,
    orderReference: o.orderReference,
    orderDate: String(o.orderDate),
    amount,
    currency: o.currency,
    "productName[]": o.productName,
    "productCount[]": "1",
    "productPrice[]": amount,
    returnUrl: o.returnUrl,
    serviceUrl: o.serviceUrl,
    orderTimeout: String(o.orderTimeout),
    language: o.language ?? "UA",
  };
  if (o.clientFirstName) fields.clientFirstName = o.clientFirstName;
  if (o.clientLastName) fields.clientLastName = o.clientLastName;
  if (o.clientEmail) fields.clientEmail = o.clientEmail;
  return fields;
}

/** Дані, які WayForPay надсилає на serviceUrl, та відповідь CHECK_STATUS мають однаковий набір полів для підпису */
export type WfpTransaction = {
  merchantAccount: string;
  orderReference: string;
  merchantSignature?: string;
  amount: number | string;
  currency: string;
  authCode?: string;
  email?: string;
  phone?: string;
  createdDate?: number;
  processingDate?: number;
  cardPan?: string;
  cardType?: string;
  issuerBankCountry?: string;
  issuerBankName?: string;
  transactionStatus: string;
  reason?: string;
  reasonCode?: number | string;
  fee?: number;
  paymentSystem?: string;
  refundAmount?: number;
};

export function transactionSignature(t: WfpTransaction, secret: string): string {
  return hmacMd5(
    [
      t.merchantAccount,
      t.orderReference,
      t.amount,
      t.currency,
      t.authCode ?? "",
      t.cardPan ?? "",
      t.transactionStatus,
      t.reasonCode ?? "",
    ],
    secret,
  );
}

export function verifyTransaction(t: WfpTransaction, cfg: WfpConfig): boolean {
  if (!t || typeof t !== "object" || !t.merchantSignature) return false;
  if (t.merchantAccount !== cfg.merchantAccount) return false;
  return safeEqualHex(transactionSignature(t, cfg.secretKey), t.merchantSignature);
}

/** Відповідь, яку WayForPay чекає від serviceUrl, щоб припинити повторні сповіщення */
export function buildAcceptResponse(orderReference: string, secret: string, now = Math.floor(Date.now() / 1000)) {
  const status = "accept";
  return { orderReference, status, time: now, signature: hmacMd5([orderReference, status, now], secret) };
}

/** Статуси WayForPay, які означають гроші списано */
export const PAID_STATUSES = new Set(["Approved"]);
/** Остаточно неуспішні */
export const FAILED_STATUSES = new Set(["Declined", "Expired"]);
/** Повернення / скасування після оплати */
export const REFUND_STATUSES = new Set(["Refunded", "Voided"]);
/** Проміжні — нічого не робимо, чекаємо */
export const PENDING_STATUSES = new Set(["InProcessing", "WaitingAuthComplete", "Pending", "RefundInProcessing", "Created"]);

export function parseCallbackBody(raw: string): WfpTransaction | null {
  // WayForPay надсилає JSON у тілі; деякі конфігурації — як ключ форми. Обробляємо обидва варіанти.
  const tryJson = (s: string) => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" ? (v as WfpTransaction) : null;
    } catch {
      return null;
    }
  };
  const direct = tryJson(raw);
  if (direct?.orderReference) return direct;
  try {
    const params = new URLSearchParams(raw);
    for (const key of params.keys()) {
      const v = tryJson(key);
      if (v?.orderReference) return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

type FetchLike = typeof fetch;

/** Серверна перевірка статусу платежу (CHECK_STATUS) — з перевіркою підпису відповіді */
export async function checkStatus(cfg: WfpConfig, orderReference: string, f: FetchLike = fetch): Promise<WfpTransaction | null> {
  const body = {
    transactionType: "CHECK_STATUS",
    merchantAccount: cfg.merchantAccount,
    orderReference,
    merchantSignature: hmacMd5([cfg.merchantAccount, orderReference], cfg.secretKey),
    apiVersion: 1,
  };
  const res = await f(WFP_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`WayForPay CHECK_STATUS HTTP ${res.status}`);
  const data = (await res.json()) as WfpTransaction;
  if (!data?.transactionStatus) return null; // замовлення не знайдено / ще не створено
  if (!verifyTransaction(data, cfg)) throw new Error("WayForPay CHECK_STATUS: невірний підпис відповіді");
  return data;
}

/** Повернення коштів (повне або часткове) */
export async function refund(
  cfg: WfpConfig,
  p: { orderReference: string; amount: number; currency: string; comment: string },
  f: FetchLike = fetch,
): Promise<{ ok: boolean; transactionStatus?: string; reason?: string; reasonCode?: number | string }> {
  const amount = formatAmount(p.amount);
  const body = {
    transactionType: "REFUND",
    merchantAccount: cfg.merchantAccount,
    orderReference: p.orderReference,
    amount,
    currency: p.currency,
    comment: p.comment.slice(0, 200),
    merchantSignature: hmacMd5([cfg.merchantAccount, p.orderReference, amount, p.currency], cfg.secretKey),
    apiVersion: 1,
  };
  const res = await f(WFP_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
  const data = (await res.json()) as { transactionStatus?: string; reason?: string; reasonCode?: number | string };
  const ok = data.transactionStatus === "Refunded" || data.transactionStatus === "Voided" || data.transactionStatus === "RefundInProcessing";
  return { ok, transactionStatus: data.transactionStatus, reason: data.reason, reasonCode: data.reasonCode };
}

/** Коди відповідей WayForPay, важливі для перевірки підключення */
export const WFP_REASON = {
  OK: 1100,
  INVALID_SIGNATURE: 1113,
  ACCOUNT_NOT_FOUND: 1121,
  API_NOT_ALLOWED: 1117,
  MERCHANT_RESTRICTION: 1118,
  ORDER_NOT_FOUND: 1127,
} as const;

/**
 * Перевірка облікових даних без платежу: запит статусу неіснуючого замовлення.
 * «Order Not Found» (1127) означає, що логін і секретний ключ прийнято.
 */
export async function probeCredentials(
  cfg: WfpConfig,
  f: FetchLike = fetch,
): Promise<{ ok: boolean; reasonCode: number | null; reason: string; hint: string }> {
  const orderReference = `PROBE-${Date.now()}`;
  const res = await f(WFP_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transactionType: "CHECK_STATUS",
      merchantAccount: cfg.merchantAccount,
      orderReference,
      merchantSignature: hmacMd5([cfg.merchantAccount, orderReference], cfg.secretKey),
      apiVersion: 1,
    }),
    cache: "no-store",
  });
  if (!res.ok) return { ok: false, reasonCode: null, reason: `HTTP ${res.status}`, hint: "WayForPay недоступний — спробуй пізніше." };
  const data = (await res.json()) as { reasonCode?: number | string; reason?: string };
  const code = data.reasonCode != null ? Number(data.reasonCode) : null;
  const reason = String(data.reason ?? "");
  const hints: Record<number, string> = {
    [WFP_REASON.ORDER_NOT_FOUND]: "Логін і секретний ключ прийнято.",
    [WFP_REASON.OK]: "Логін і секретний ключ прийнято.",
    [WFP_REASON.INVALID_SIGNATURE]: "Невірний Merchant Secret Key — перевір змінну WAYFORPAY_SECRET_KEY (без пробілів).",
    [WFP_REASON.ACCOUNT_NOT_FOUND]: "Невірний Merchant Login — перевір WAYFORPAY_MERCHANT_ACCOUNT.",
    [WFP_REASON.API_NOT_ALLOWED]: "Для мерчанта не дозволено API — попроси підтримку WayForPay увімкнути.",
    [WFP_REASON.MERCHANT_RESTRICTION]: "Обмеження мерчанта — звернись у підтримку WayForPay.",
  };
  const ok = code === WFP_REASON.ORDER_NOT_FOUND || code === WFP_REASON.OK;
  return { ok, reasonCode: code, reason, hint: (code != null && hints[code]) || "Неочікувана відповідь — покажи її підтримці WayForPay." };
}

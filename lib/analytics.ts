/**
 * Аналітика без персональних даних: лише назва послуги, ціна, крок воронки.
 * Ім'я, email, Instagram та відповіді анкети НІКОЛИ не передаються в GA4 / Meta Pixel.
 */
"use client";

type Params = { service?: string; value?: number; currency?: string; step?: string; location?: string };

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export type FunnelEvent =
  | "service_click" // клік на послугу / кнопку бронювання
  | "view_service" // перегляд сторінки послуги
  | "begin_booking" // відкрито бронювання
  | "select_slot" // обрано дату й час
  | "form_complete" // анкету заповнено
  | "begin_checkout" // перехід до оплати
  | "purchase"; // підтверджена оплата

const META_MAP: Partial<Record<FunnelEvent, string>> = {
  view_service: "ViewContent",
  begin_booking: "Lead",
  begin_checkout: "InitiateCheckout",
  purchase: "Purchase",
};

export function track(event: FunnelEvent, p: Params = {}) {
  if (typeof window === "undefined") return;
  const clean: Record<string, unknown> = {};
  if (p.service) clean.service = p.service;
  if (typeof p.value === "number") clean.value = p.value;
  if (p.currency) clean.currency = p.currency;
  if (p.step) clean.step = p.step;
  if (p.location) clean.location = p.location;

  try {
    window.gtag?.("event", event, clean);
    const meta = META_MAP[event];
    if (meta && window.fbq) {
      window.fbq("track", meta, p.value ? { value: p.value, currency: p.currency ?? "EUR", content_name: p.service } : { content_name: p.service });
    }
  } catch {
    /* аналітика ніколи не ламає сайт */
  }
}

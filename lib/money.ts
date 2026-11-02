import { site } from "../content/site.ts";

/** Орієнтовна сума в гривнях для довідки. rate — актуальний курс НБУ (див. lib/fx.ts), за замовчуванням запасний. */
export function uah(eur: number, rate: number = site.uahRate): string {
  const v = Math.round((eur * rate) / 10) * 10;
  return `≈ ${new Intl.NumberFormat("uk-UA").format(v).replace(/ /g, " ")} грн`;
}

export type EurRate = { rate: number; date: string | null; source: "nbu" | "fallback" };

/** Розбір відповіді API НБУ; повертає null, якщо дані некоректні */
export function parseNbu(json: unknown): EurRate | null {
  const row = Array.isArray(json) ? (json[0] as { rate?: unknown; exchangedate?: unknown; cc?: unknown }) : null;
  const rate = Number(row?.rate);
  if (!row || String(row.cc).toUpperCase() !== "EUR" || !Number.isFinite(rate) || rate < 10 || rate > 500) return null;
  return { rate, date: typeof row.exchangedate === "string" ? row.exchangedate : null, source: "nbu" };
}


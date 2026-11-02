/**
 * Офіційний курс євро від НБУ (відкритий API bank.gov.ua).
 * Оновлюється автоматично: результат кешується на 6 годин. Якщо API недоступний —
 * використовується запасний курс із content/site.ts → uahRate.
 */
import "server-only";
import { site } from "../content/site.ts";
import { parseNbu, type EurRate } from "./money.ts";

export type { EurRate };

const NBU_URL = "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchangenew?json&valcode=EUR";

export async function getEurUah(): Promise<EurRate> {
  try {
    const res = await fetch(NBU_URL, {
      next: { revalidate: 6 * 3600 },
      signal: AbortSignal.timeout(5000),
    } as RequestInit);
    if (res.ok) {
      const parsed = parseNbu(await res.json());
      if (parsed) return parsed;
    }
  } catch {
    /* мережа недоступна — нижче запасний курс */
  }
  return { rate: site.uahRate, date: null, source: "fallback" };
}

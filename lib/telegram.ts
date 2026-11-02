/**
 * Сповіщення власниці в Telegram. Повідомлення йдуть лише в особистий чат (TELEGRAM_CHAT_ID),
 * повна анкета — за посиланням в адмінку, яке відкривається тільки після входу.
 */
import "server-only";
import { env } from "./env.ts";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function telegramConfigured(): boolean {
  const t = env.telegram();
  return Boolean(t.token && t.chatId);
}

export async function sendTelegram(html: string, button?: { text: string; url: string }): Promise<void> {
  const t = env.telegram();
  if (!t.token || !t.chatId) throw new Error("Telegram не налаштовано");
  // Захист: бот надсилає лише в особистий чат (id додатний). Групи/канали мають від'ємні id.
  if (!/^\d+$/.test(t.chatId)) throw new Error("TELEGRAM_CHAT_ID має бути id особистого чату (додатне число)");

  const body: Record<string, unknown> = {
    chat_id: t.chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  };
  // Telegram приймає кнопки лише з https-посиланнями
  if (button && button.url.startsWith("https://")) {
    body.reply_markup = { inline_keyboard: [[{ text: button.text, url: button.url }]] };
  }
  const res = await fetch(`https://api.telegram.org/bot${t.token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Telegram: помилка ${res.status} ${await res.text().catch(() => "")}`);
}

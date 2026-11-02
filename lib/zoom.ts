/**
 * Zoom: створення зустрічі через Server-to-Server OAuth.
 * Якщо API не налаштовано — використовується ZOOM_FALLBACK_LINK (наприклад, персональна кімната).
 */
import "server-only";
import { env } from "./env.ts";

let token: { value: string; exp: number } | null = null;

/** api — створюємо зустрічі через Zoom API; link — одне постійне посилання; manual — посилання надсилаєш сама */
export function zoomMode(): "api" | "link" | "manual" {
  if (apiConfigured()) return "api";
  return env.zoom().fallbackLink ? "link" : "manual";
}

function apiConfigured() {
  const z = env.zoom();
  return Boolean(z.accountId && z.clientId && z.clientSecret);
}

async function accessToken(): Promise<string> {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const z = env.zoom();
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(z.accountId)}`,
    {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${z.clientId}:${z.clientSecret}`).toString("base64") },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok) throw new Error(`Zoom: не вдалося авторизуватися (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return token.value;
}

export async function createMeeting(p: { topic: string; start: Date; durationMin: number }): Promise<{ id: string | null; joinUrl: string } | null> {
  if (!apiConfigured()) {
    const fallback = env.zoom().fallbackLink;
    // Ручний режим: посилання клієнту надсилаєш ти особисто
    if (!fallback) return null;
    return { id: null, joinUrl: fallback };
  }
  const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: p.topic.slice(0, 200),
      type: 2,
      start_time: p.start.toISOString().replace(/\.\d{3}Z$/, "Z"),
      duration: p.durationMin,
      timezone: "Europe/Kiev",
      settings: { join_before_host: false, waiting_room: true, mute_upon_entry: false },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Zoom: не вдалося створити зустріч (${res.status})`);
  const data = (await res.json()) as { id: number | string; join_url: string };
  return { id: String(data.id), joinUrl: data.join_url };
}

export async function deleteMeeting(id: string): Promise<void> {
  if (!apiConfigured() || !id) return;
  const res = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${await accessToken()}` },
    cache: "no-store",
  });
  if (!res.ok && res.status !== 404) throw new Error(`Zoom: не вдалося видалити зустріч (${res.status})`);
}

/** Транзакційні листи через Resend (https://resend.com) */
import "server-only";
import { env } from "./env.ts";

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: string /* base64 */; contentType?: string }[];
};

export async function sendEmail(m: Mail): Promise<void> {
  const e = env.email();
  if (!e.resendKey) throw new Error("Email не налаштовано: додай RESEND_API_KEY");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${e.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: e.from,
      to: [m.to],
      reply_to: e.replyTo || undefined,
      subject: m.subject,
      html: m.html,
      text: m.text,
      attachments: m.attachments?.map((a) => ({ filename: a.filename, content: a.content, content_type: a.contentType })),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Email: помилка ${res.status} ${await res.text().catch(() => "")}`);
}

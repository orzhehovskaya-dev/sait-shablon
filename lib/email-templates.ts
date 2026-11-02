/**
 * Шаблони листів клієнту. Простий табличний HTML — коректно відображається в Gmail, Apple Mail, Outlook.
 */
import { formatDateUk, timeKey, TZ } from "./time.ts";
import { site } from "../content/site.ts";

export type MailBooking = {
  firstName: string;
  serviceName: string;
  start: Date;
  durationLabel: string;
  zoomUrl: string | null;
  preparation: string[];
  icsUrl: string;
  googleUrl: string;
  policies: { reschedule: string; cancel: string; noShow: string };
  contactUrl: string;
  personName: string;
  /** Посилання на анкету, якщо клієнт її ще не заповнив */
  questionnaireUrl?: string | null;
};

function questionnaireBlock(b: MailBooking) {
  if (!b.questionnaireUrl) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;background:#fff;border:1px solid ${C.line};border-radius:12px;"><tr><td style="padding:20px;">
<p style="font-size:16px;font-weight:600;margin:0 0 6px;">Останній крок — коротка анкета</p>
<p style="font-size:14px;line-height:1.5;color:${C.grey};margin:0 0 16px;">Розкажи про свій запит і запитання — я підготуюся до зустрічі заздалегідь. Це займе 3–5 хвилин.</p>
${button(b.questionnaireUrl, "Заповнити анкету")}
</td></tr></table>`;
}

const C = { milk: "#F7F2EC", ink: "#0A0A0A", bordeaux: "#5E0B1A", grey: "#6F6863", line: "#E3D9CF" };

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function layout(title: string, inner: string, footer = "Цей лист надіслано, бо на цю адресу заброньовано зустріч на сайті. Якщо це помилка — просто відповідай на лист.") {
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:${C.milk};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${C.ink};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.milk};"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:-0.03em;color:#5f0c19;padding-bottom:28px;border-bottom:1px solid ${C.line};">${esc(site.brand)}</td></tr>
${inner}
<tr><td style="padding-top:32px;border-top:1px solid ${C.line};font-size:12px;line-height:1.6;color:${C.grey};">${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
}

function button(href: string, label: string) {
  return `<a href="${esc(href)}" style="display:inline-block;background:${C.bordeaux};color:#fff;text-decoration:none;padding:14px 22px;border-radius:999px;font-size:15px;">${esc(label)}</a>`;
}

function details(b: MailBooking) {
  const when = `${formatDateUk(b.start, TZ)}, ${timeKey(b.start, TZ)} (Київ)`;
  const row = (k: string, v: string) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid ${C.line};color:${C.grey};font-size:14px;width:38%;vertical-align:top;">${k}</td><td style="padding:10px 0;border-bottom:1px solid ${C.line};font-size:15px;">${v}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
${row("Послуга", esc(b.serviceName))}
${row("Дата і час", esc(when))}
${row("Тривалість", esc(b.durationLabel))}
${row("Де", b.zoomUrl ? `<a href="${esc(b.zoomUrl)}" style="color:${C.bordeaux};">Zoom — посилання на зустріч</a>` : "Посилання на Zoom надішлю тобі особисто перед зустріччю")}
</table>`;
}

export function confirmationEmail(b: MailBooking) {
  const subject = `Зустріч заброньовано — ${b.serviceName}`;
  const prep = b.preparation.map((p) => `<li style="margin-bottom:8px;">${esc(p)}</li>`).join("");
  const html = layout(
    subject,
    `<tr><td style="padding-top:32px;">
<h1 style="font-family:Helvetica,Arial,sans-serif;font-weight:700;letter-spacing:-0.02em;color:#5f0c19;font-size:30px;line-height:1.2;margin:0 0 16px;">Вітаю! Твоя зустріч успішно заброньована ❤️</h1>
<p style="font-size:16px;line-height:1.6;margin:0 0 8px;">${esc(b.firstName)}, оплату отримано — час закріплено за тобою.</p>
${details(b)}
${b.zoomUrl ? `<p style="margin:0 0 28px;">${button(b.zoomUrl, "Відкрити посилання на Zoom")}</p>` : ""}
<p style="font-size:15px;margin:0 0 6px;"><a href="${esc(b.icsUrl)}" style="color:${C.bordeaux};">Додати в календар iPhone / Outlook (.ics)</a></p>
<p style="font-size:15px;margin:0 0 28px;"><a href="${esc(b.googleUrl)}" style="color:${C.bordeaux};">Додати в Google Calendar</a></p>
${questionnaireBlock(b)}
<h2 style="font-family:Helvetica,Arial,sans-serif;font-weight:700;letter-spacing:-0.02em;color:#5f0c19;font-size:22px;margin:0 0 12px;">Як підготуватися</h2>
<ul style="padding-left:18px;margin:0 0 28px;font-size:15px;line-height:1.6;">${prep}</ul>
<h2 style="font-family:Helvetica,Arial,sans-serif;font-weight:700;letter-spacing:-0.02em;color:#5f0c19;font-size:22px;margin:0 0 12px;">Перенесення та скасування</h2>
<p style="font-size:14px;line-height:1.6;color:${C.grey};margin:0 0 8px;">${esc(b.policies.reschedule)}</p>
<p style="font-size:14px;line-height:1.6;color:${C.grey};margin:0 0 8px;">${esc(b.policies.cancel)}</p>
<p style="font-size:14px;line-height:1.6;color:${C.grey};margin:0 0 20px;">${esc(b.policies.noShow)}</p>
<p style="font-size:15px;margin:0 0 32px;">Щоб перенести зустріч, напиши мені: <a href="${esc(b.contactUrl)}" style="color:${C.bordeaux};">${esc(b.contactUrl.replace(/^https?:\/\//, ""))}</a></p>
<p style="font-size:15px;margin:0;">До зустрічі,<br>${esc(b.personName)}</p>
</td></tr>`,
  );
  const text = [
    "Вітаю! Твоя зустріч успішно заброньована ❤️",
    "",
    `Послуга: ${b.serviceName}`,
    `Дата і час: ${formatDateUk(b.start, TZ)}, ${timeKey(b.start, TZ)} (Київ)`,
    `Тривалість: ${b.durationLabel}`,
    `Zoom: ${b.zoomUrl ?? "посилання надішлю окремо"}`,
    "",
    `Додати в календар: ${b.icsUrl}`,
    "",
    ...(b.questionnaireUrl ? [`Заповни коротку анкету перед зустріччю: ${b.questionnaireUrl}`, ""] : []),
    "Як підготуватися:",
    ...b.preparation.map((p) => `— ${p}`),
    "",
    "Перенесення та скасування:",
    b.policies.reschedule,
    b.policies.cancel,
    b.policies.noShow,
    "",
    `Зв'язок: ${b.contactUrl}`,
  ].join("\n");
  return { subject, html, text };
}

export function reminderEmail(b: MailBooking) {
  const subject = `Нагадування: завтра зустріч — ${b.serviceName}`;
  const html = layout(
    subject,
    `<tr><td style="padding-top:32px;">
<h1 style="font-family:Helvetica,Arial,sans-serif;font-weight:700;letter-spacing:-0.02em;color:#5f0c19;font-size:30px;line-height:1.2;margin:0 0 16px;">До зустрічі залишилась доба</h1>
<p style="font-size:16px;line-height:1.6;margin:0 0 8px;">${esc(b.firstName)}, нагадую про нашу зустріч.</p>
${questionnaireBlock(b)}
${details(b)}
${b.zoomUrl ? `<p style="margin:0 0 28px;">${button(b.zoomUrl, "Відкрити посилання на Zoom")}</p>` : ""}
<p style="font-size:14px;line-height:1.6;color:${C.grey};margin:0 0 24px;">${esc(b.policies.reschedule)}</p>
<p style="font-size:15px;margin:0;">${esc(b.personName)}</p>
</td></tr>`,
  );
  const text = `До зустрічі залишилась доба.\n\n${b.serviceName}\n${formatDateUk(b.start, TZ)}, ${timeKey(b.start, TZ)} (Київ)\nZoom: ${b.zoomUrl ?? "посилання надішлю особисто"}\n\n${b.policies.reschedule}`;
  return { subject, html, text };
}

export function cancellationEmail(b: Pick<MailBooking, "firstName" | "serviceName" | "start" | "contactUrl" | "personName">, refunded: boolean) {
  const subject = `Бронювання скасовано — ${b.serviceName}`;
  const when = `${formatDateUk(b.start, TZ)}, ${timeKey(b.start, TZ)} (Київ)`;
  const body = refunded
    ? "Кошти повернуто на картку, з якої була оплата. Зарахування зазвичай займає від кількох хвилин до кількох робочих днів — залежно від банку."
    : "Якщо маєш запитання щодо скасування, напиши мені.";
  const html = layout(
    subject,
    `<tr><td style="padding-top:32px;">
<h1 style="font-family:Helvetica,Arial,sans-serif;font-weight:700;letter-spacing:-0.02em;color:#5f0c19;font-size:30px;line-height:1.2;margin:0 0 16px;">Бронювання скасовано</h1>
<p style="font-size:16px;line-height:1.6;margin:0 0 16px;">${esc(b.firstName)}, зустріч «${esc(b.serviceName)}» на ${esc(when)} скасовано.</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 24px;">${esc(body)}</p>
<p style="font-size:15px;margin:0 0 32px;"><a href="${esc(b.contactUrl)}" style="color:${C.bordeaux};">Написати мені</a></p>
<p style="font-size:15px;margin:0;">${esc(b.personName)}</p>
</td></tr>`,
  );
  const text = `Бронювання скасовано.\n${b.serviceName}, ${when}\n\n${body}\n\n${b.contactUrl}`;
  return { subject, html, text };
}


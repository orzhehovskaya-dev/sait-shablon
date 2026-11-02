/**
 * Перевірка анкети. Використовується і в браузері (підказки), і на сервері (остаточна перевірка).
 */

export type SocialLink = { label: string; url: string };

export type BookingForm = {
  fullName: string;
  email: string;
  contact: string;
  instagram: string;
  occupation: string;
  mainRequest: string;
  desiredResult: string;
  questions: string;
  tiktok: string;
  youtube: string;
  website: string;
  otherSocials: SocialLink[];
  // лише для стратегії
  products: string;
  averageCheck: string;
  acquisitionProblems: string;
  goal3m: string;
  consent: boolean;
};

export const emptyForm: BookingForm = {
  fullName: "",
  email: "",
  contact: "",
  instagram: "",
  occupation: "",
  mainRequest: "",
  desiredResult: "",
  questions: "",
  tiktok: "",
  youtube: "",
  website: "",
  otherSocials: [],
  products: "",
  averageCheck: "",
  acquisitionProblems: "",
  goal3m: "",
  consent: false,
};

export type FieldErrors = Partial<Record<keyof BookingForm | "otherSocials", string>>;

const LIMITS: Partial<Record<keyof BookingForm, number>> = {
  fullName: 120,
  email: 200,
  contact: 120,
  instagram: 200,
  occupation: 600,
  mainRequest: 1500,
  desiredResult: 1500,
  questions: 2000,
  tiktok: 200,
  youtube: 200,
  website: 200,
  products: 1500,
  averageCheck: 120,
  acquisitionProblems: 1500,
  goal3m: 1500,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Приймає @нік, нік або посилання і повертає повне посилання на Instagram */
export function normalizeInstagram(v: string): string {
  const s = v.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/instagram\.com\//i.test(s)) return `https://${s.replace(/^\/+/, "")}`;
  const handle = s.replace(/^@/, "").replace(/\/+$/, "");
  return `https://instagram.com/${handle}`;
}

export function normalizeUrl(v: string): string {
  const s = v.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("@")) return s; // нік без платформи залишаємо як є
  return `https://${s}`;
}

function isPlausibleUrl(v: string): boolean {
  if (!v) return true;
  if (v.startsWith("@")) return true;
  try {
    const u = new URL(v);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v.replace(/\u0000/g, "").trim() : "";
}

/**
 * stage "contact" — перед оплатою: лише ім'я, email, контакт, Instagram і згода.
 * stage "questionnaire" — після оплати: анкета (запит, цілі, запитання, соцмережі, питання для стратегії).
 * stage "full" — усе разом (для сумісності й тестів).
 */
export type FormStage = "contact" | "questionnaire" | "full";

export const CONTACT_FIELDS: (keyof BookingForm)[] = ["fullName", "email", "contact", "instagram"];
export const QUESTIONNAIRE_FIELDS: (keyof BookingForm)[] = ["occupation", "mainRequest", "desiredResult", "questions"];
export const STRATEGY_FIELDS: (keyof BookingForm)[] = ["products", "averageCheck", "acquisitionProblems", "goal3m"];

export function validateForm(
  raw: unknown,
  opts: { extended: boolean; stage?: FormStage },
): { ok: true; data: BookingForm } | { ok: false; errors: FieldErrors } {
  const stage = opts.stage ?? "full";
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const errors: FieldErrors = {};

  const data: BookingForm = {
    fullName: str(r.fullName),
    email: str(r.email).toLowerCase(),
    contact: str(r.contact),
    instagram: normalizeInstagram(str(r.instagram)),
    occupation: str(r.occupation),
    mainRequest: str(r.mainRequest),
    desiredResult: str(r.desiredResult),
    questions: str(r.questions),
    tiktok: normalizeUrl(str(r.tiktok)),
    youtube: normalizeUrl(str(r.youtube)),
    website: normalizeUrl(str(r.website)),
    otherSocials: Array.isArray(r.otherSocials)
      ? (r.otherSocials as unknown[])
          .slice(0, 6)
          .map((x) => {
            const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
            return { label: str(o.label).slice(0, 40), url: normalizeUrl(str(o.url)) };
          })
          .filter((x) => x.url)
      : [],
    products: opts.extended ? str(r.products) : "",
    averageCheck: opts.extended ? str(r.averageCheck) : "",
    acquisitionProblems: opts.extended ? str(r.acquisitionProblems) : "",
    goal3m: opts.extended ? str(r.goal3m) : "",
    consent: r.consent === true,
  };

  const required: (keyof BookingForm)[] = [];
  if (stage !== "questionnaire") required.push(...CONTACT_FIELDS);
  if (stage !== "contact") {
    required.push(...QUESTIONNAIRE_FIELDS);
    if (opts.extended) required.push(...STRATEGY_FIELDS);
  }

  for (const k of required) {
    if (!data[k]) errors[k] = "Заповни це поле";
  }

  if (data.fullName && data.fullName.split(/\s+/).length < 2) errors.fullName = "Вкажи ім'я та прізвище";
  if (data.email && !EMAIL_RE.test(data.email)) errors.email = "Перевір email — схоже, в ньому помилка";
  if (data.instagram && !isPlausibleUrl(data.instagram)) errors.instagram = "Вкажи нік або посилання на профіль";
  for (const k of ["tiktok", "youtube", "website"] as const) {
    if (data[k] && !isPlausibleUrl(data[k])) errors[k] = "Перевір посилання";
  }
  if (data.otherSocials.some((s) => !isPlausibleUrl(s.url))) errors.otherSocials = "Перевір посилання";

  for (const [k, max] of Object.entries(LIMITS) as [keyof BookingForm, number][]) {
    const v = data[k];
    if (typeof v === "string" && v.length > max) errors[k] = `Максимум ${max} символів`;
  }

  if (stage !== "questionnaire" && !data.consent) errors.consent = "Потрібна згода на обробку персональних даних";

  // Перевіряємо лише поля свого етапу, щоб помилки не стосувалися прихованих полів
  if (stage === "contact") {
    for (const k of Object.keys(errors) as (keyof FieldErrors)[]) {
      if (![...CONTACT_FIELDS, "consent"].includes(k as keyof BookingForm)) delete errors[k];
    }
  } else if (stage === "questionnaire") {
    for (const k of CONTACT_FIELDS) delete errors[k];
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

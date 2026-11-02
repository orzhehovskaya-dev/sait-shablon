"use client";

import { useState } from "react";
import { emptyForm, validateForm, type BookingForm, type FieldErrors } from "@/lib/validation";
import { Field } from "./Field";

/** Анкета після оплати: запит, цілі, запитання, соцмережі (+ питання для стратегії) */
export function QuestionnaireForm({ token, serviceSlug, extended, onDone }: { token: string; serviceSlug: string; extended: boolean; onDone: () => void }) {
  const [form, setForm] = useState<BookingForm>(emptyForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const service = { slug: serviceSlug, extendedForm: extended };

  const set = <K extends keyof BookingForm>(k: K, v: BookingForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validateForm(form, { extended, stage: "questionnaire" });
    if (!v.ok) {
      setErrors(v.errors);
      document.getElementById(`f-${Object.keys(v.errors)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings/questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, form: v.data }),
      });
      const data = await res.json();
      if (res.status === 422) {
        setErrors(data.fields || {});
        return;
      }
      if (!res.ok) throw new Error(data.error || "Не вдалося зберегти анкету");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form questionnaire" onSubmit={submit} noValidate>
      <fieldset>
        <legend>Про тебе</legend>
        <Field id="occupation" label="Чим займаєшся?" value={form.occupation} error={errors.occupation} onChange={(v) => set("occupation", v)} multiline rows={2} />
      </fieldset>

              <fieldset>
                <legend>Запит</legend>
                <Field id="mainRequest" label="Який твій головний запит?" value={form.mainRequest} error={errors.mainRequest} onChange={(v) => set("mainRequest", v)} multiline />
                <Field id="desiredResult" label="Якого результату хочеш досягти?" value={form.desiredResult} error={errors.desiredResult} onChange={(v) => set("desiredResult", v)} multiline />
                <Field
                  id="questions"
                  label="Які запитання хочеш поставити на зустрічі?"
                  value={form.questions}
                  error={errors.questions}
                  onChange={(v) => set("questions", v)}
                  multiline
                  hint={service.slug === "konsultatsiia" ? "До трьох головних запитань" : undefined}
                />
              </fieldset>

              {service.extendedForm && (
                <fieldset>
                  <legend>Для стратегії</legend>
                  <Field id="products" label="Які продукти або послуги зараз продаєш?" value={form.products} error={errors.products} onChange={(v) => set("products", v)} multiline />
                  <Field id="averageCheck" label="Який середній чек?" value={form.averageCheck} error={errors.averageCheck} onChange={(v) => set("averageCheck", v)} placeholder="Наприклад, 3 000 грн" />
                  <Field id="acquisitionProblems" label="Які основні проблеми із залученням клієнтів?" value={form.acquisitionProblems} error={errors.acquisitionProblems} onChange={(v) => set("acquisitionProblems", v)} multiline />
                  <Field id="goal3m" label="Яка ціль на найближчі три місяці?" value={form.goal3m} error={errors.goal3m} onChange={(v) => set("goal3m", v)} multiline />
                </fieldset>
              )}

              <fieldset>
                <legend>Інші соцмережі</legend>
                <Field id="tiktok" label="TikTok" optional value={form.tiktok} error={errors.tiktok} onChange={(v) => set("tiktok", v)} autoCapitalize="none" />
                <Field id="youtube" label="YouTube" optional value={form.youtube} error={errors.youtube} onChange={(v) => set("youtube", v)} autoCapitalize="none" />
                <Field id="website" label="Сайт" optional value={form.website} error={errors.website} onChange={(v) => set("website", v)} autoCapitalize="none" inputMode="url" />
                {form.otherSocials.map((s, i) => (
                  <div className="socials-row" key={i}>
                    <div className="field">
                      <label htmlFor={`soc-l-${i}`} className="sr-only">
                        Назва
                      </label>
                      <input
                        id={`soc-l-${i}`}
                        placeholder="Мережа"
                        value={s.label}
                        onChange={(e) => set("otherSocials", form.otherSocials.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`soc-u-${i}`} className="sr-only">
                        Посилання
                      </label>
                      <input
                        id={`soc-u-${i}`}
                        placeholder="Посилання"
                        autoCapitalize="none"
                        value={s.url}
                        onChange={(e) => set("otherSocials", form.otherSocials.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                      />
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Прибрати посилання"
                      onClick={() => set("otherSocials", form.otherSocials.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {errors.otherSocials && <span className="field__error">{errors.otherSocials}</span>}
                {form.otherSocials.length < 6 && (
                  <button type="button" className="text-btn" onClick={() => set("otherSocials", [...form.otherSocials, { label: "", url: "" }])}>
                    Додати ще посилання
                  </button>
                )}
              </fieldset>

      {error && (
        <div className="notice notice--error" role="alert">
          {error}
        </div>
      )}
      <button type="submit" className="btn btn--block" disabled={busy}>
        {busy ? "Зберігаємо…" : "Надіслати анкету"}
      </button>
    </form>
  );
}

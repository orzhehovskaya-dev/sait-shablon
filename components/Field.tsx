"use client";

import type { BookingForm } from "@/lib/validation";

export function Field(props: {
  id: keyof BookingForm;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  optional?: boolean;
  multiline?: boolean;
  rows?: number;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  autoCapitalize?: string;
  inputMode?: "email" | "url" | "text" | "tel";
}) {
  const id = `f-${props.id}`;
  const describedBy = [props.hint ? `${id}-hint` : "", props.error ? `${id}-err` : ""].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    name: props.id,
    value: props.value,
    placeholder: props.placeholder,
    "aria-invalid": Boolean(props.error),
    "aria-describedby": describedBy,
    required: !props.optional,
  };
  return (
    <div className="field" data-error={Boolean(props.error)}>
      <label htmlFor={id}>
        {props.label} {props.optional && <span className="opt">— необов'язково</span>}
      </label>
      {props.multiline ? (
        <textarea {...common} rows={props.rows ?? 3} onChange={(e) => props.onChange(e.target.value)} />
      ) : (
        <input
          {...common}
          type={props.type ?? "text"}
          autoComplete={props.autoComplete}
          autoCapitalize={props.autoCapitalize}
          inputMode={props.inputMode}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
      {props.hint && (
        <span className="field__hint" id={`${id}-hint`}>
          {props.hint}
        </span>
      )}
      {props.error && (
        <span className="field__error" id={`${id}-err`}>
          {props.error}
        </span>
      )}
    </div>
  );
}

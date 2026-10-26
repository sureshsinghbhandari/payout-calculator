"use client";

import { useId } from "react";
import { inputClass } from "./ui";

interface FieldProps {
  label: string;
  name: string;
  defaultValue?: string;
  error?: string;
  hint?: React.ReactNode;
  optional?: boolean;
}

function describedBy(id: string, hint: unknown, error: unknown): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

function FieldLabel({ htmlFor, label, optional }: { htmlFor: string; label: string; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-900">
      {label}
      {optional && <span className="font-normal text-slate-500"> (optional)</span>}
    </label>
  );
}

function FieldMessages({ id, hint, error }: { id: string; hint?: React.ReactNode; error?: string }) {
  return (
    <>
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </>
  );
}

export function TextField({
  label,
  name,
  defaultValue,
  error,
  hint,
  optional,
  type = "text",
  autoComplete,
  inputMode,
  min,
  max,
  maxLength,
  spellCheck,
  autoCapitalize,
}: FieldProps & {
  type?: "text" | "email" | "tel" | "date" | "password";
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  min?: string;
  max?: string;
  maxLength?: number;
  spellCheck?: boolean;
  autoCapitalize?: string;
}) {
  const id = useId();
  return (
    <div>
      <FieldLabel htmlFor={id} label={label} optional={optional} />
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={!optional}
        autoComplete={autoComplete}
        inputMode={inputMode}
        min={min}
        max={max}
        maxLength={maxLength}
        spellCheck={spellCheck}
        autoCapitalize={autoCapitalize}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={inputClass(error)}
      />
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  error,
  hint,
  options,
}: FieldProps & { options: { value: string; label: string }[] }) {
  const id = useId();
  return (
    <div>
      <FieldLabel htmlFor={id} label={label} />
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={inputClass(error)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

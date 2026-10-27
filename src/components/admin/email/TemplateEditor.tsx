"use client";

import { useActionState, useId, useState } from "react";
import { saveTemplateAction, type TemplateState } from "@/app/admin/settings/email-templates/actions";
import {
  DEFAULT_TEMPLATES,
  placeholderHelp,
  renderTemplate,
  TEMPLATE_INFO,
  TEMPLATE_LIMITS,
  type EmailTemplate,
  type TemplateKey,
} from "@/lib/email-templates";
import { formatTimestamp, inputClass, labelClass, primaryButton, secondaryButton } from "../users/ui";

interface Props {
  templateKey: TemplateKey;
  /** The template in use now (saved or default). */
  current: EmailTemplate;
  /** Who last changed it, when it is not the default. */
  saved: { updatedAt: string; updatedBy: string } | null;
  /** Example placeholder values for the preview. */
  sample: Record<string, string>;
  storageConfigured: boolean;
}

/** Edit one email template, with a live preview using example details. */
export function TemplateEditor({ templateKey, current, saved, sample, storageConfigured }: Props) {
  const info = TEMPLATE_INFO[templateKey];
  const [subject, setSubject] = useState(current.subject);
  const [body, setBody] = useState(current.body);
  const [state, formAction, pending] = useActionState<TemplateState, FormData>(async (prev, formData) => {
    const next = await saveTemplateAction(prev, formData);
    if (next.status === "ok" && next.template) {
      setSubject(next.template.subject);
      setBody(next.template.body);
    }
    return next;
  }, { status: "idle" });
  const id = useId();
  const headingId = `${id}-heading`;
  const errors = state.fieldErrors ?? {};
  const preview = renderTemplate({ subject, body }, sample);
  const isDefault = subject === DEFAULT_TEMPLATES[templateKey].subject && body === DEFAULT_TEMPLATES[templateKey].body;

  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id={headingId} className="text-lg font-semibold text-slate-900">
          {info.label}
        </h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${saved ? "bg-blue-100 text-blue-900" : "bg-slate-200 text-slate-700"}`}
        >
          {saved ? "Changed" : "Default wording"}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-600">{info.description}</p>
      {saved && (
        <p className="mt-1 text-xs text-slate-500">
          Last changed {saved.updatedBy ? `by ${saved.updatedBy} ` : ""}on {formatTimestamp(saved.updatedAt)}
        </p>
      )}

      <details className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
        <summary className="cursor-pointer font-semibold text-slate-800">Placeholders you can use</summary>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {info.placeholders.map((name) => (
            <li key={name} className="text-slate-700">
              <code className="rounded bg-white px-1 text-slate-900">{`{${name}}`}</code> {placeholderHelp(name)}
            </li>
          ))}
        </ul>
        {templateKey !== "reset" && (
          <p className="mt-2 text-xs text-slate-600">The interest rate is never available here and is never sent.</p>
        )}
      </details>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <form action={formAction} className="space-y-4" noValidate>
          <input type="hidden" name="key" value={templateKey} />
          <div>
            <label htmlFor={`${id}-subject`} className={labelClass}>
              Subject
            </label>
            <input
              id={`${id}-subject`}
              name="subject"
              type="text"
              maxLength={TEMPLATE_LIMITS.subject}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              aria-invalid={errors.subject ? true : undefined}
              aria-describedby={errors.subject ? `${id}-subject-error` : undefined}
              className={inputClass(Boolean(errors.subject))}
            />
            {errors.subject && (
              <p id={`${id}-subject-error`} className="mt-1.5 text-xs font-medium text-red-700">
                {errors.subject}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={`${id}-body`} className={labelClass}>
              Email text
            </label>
            <textarea
              id={`${id}-body`}
              name="body"
              rows={14}
              maxLength={TEMPLATE_LIMITS.body}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              aria-invalid={errors.body ? true : undefined}
              aria-describedby={errors.body ? `${id}-body-error ${id}-body-help` : `${id}-body-help`}
              className={`${inputClass(Boolean(errors.body))} text-sm leading-relaxed`}
            />
            {errors.body && (
              <p id={`${id}-body-error`} className="mt-1.5 text-xs font-medium text-red-700">
                {errors.body}
              </p>
            )}
            <p id={`${id}-body-help`} className="mt-1.5 text-xs text-slate-500">
              Plain text. A blank line starts a new paragraph. {body.length} of {TEMPLATE_LIMITS.body} characters.
            </p>
          </div>

          {!storageConfigured && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Storage is not connected, so templates cannot be saved.
            </p>
          )}
          <p
            role="status"
            aria-live="polite"
            className={`text-sm ${state.status === "error" ? "font-medium text-red-700" : "text-emerald-800"} ${
              state.message ? "" : "sr-only"
            }`}
          >
            {pending ? "Saving…" : state.message}
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="submit" name="intent" value="save" disabled={pending || !storageConfigured} className={primaryButton}>
              Save template
            </button>
            <button
              type="submit"
              name="intent"
              value="reset"
              disabled={pending || !storageConfigured || (!saved && isDefault)}
              onClick={(e) => {
                if (!window.confirm(`Go back to the default wording for the ${info.label.toLowerCase()} email? Your changes are lost.`)) {
                  e.preventDefault();
                }
              }}
              className={secondaryButton}
            >
              Reset to default
            </button>
          </div>
        </form>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">Preview with example details</h3>
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="break-words text-sm">
              <span className="font-semibold text-slate-700">Subject: </span>
              <span className="text-slate-900">{preview.subject}</span>
            </p>
            <div className="mt-3 whitespace-pre-wrap break-words border-t border-slate-200 pt-3 text-sm leading-relaxed text-slate-800">
              {preview.body}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

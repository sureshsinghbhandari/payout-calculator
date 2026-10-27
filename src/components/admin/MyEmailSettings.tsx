"use client";

import { useActionState, useId } from "react";
import { saveMyAlertsAction, saveMyEmailAction, type AlertsState, type MyEmailState } from "@/app/admin/actions";
import { inputClass, labelClass, primaryButton, secondaryButton } from "./users/ui";

interface Props {
  email: string | null;
  inquiryAlerts: boolean;
  /** Email sending is set up, so alerts and password resets are actually sent. */
  emailEnabled: boolean;
  /** Master Admins can set email up themselves (Settings > Email). */
  canManageEmail: boolean;
}

/** My account: the admin's own email address and new inquiry alerts. */
export function MyEmailSettings({ email, inquiryAlerts, emailEnabled, canManageEmail }: Props) {
  const [emailState, emailAction, emailPending] = useActionState<MyEmailState, FormData>(saveMyEmailAction, { status: "idle" });
  const [alertsState, alertsAction, alertsPending] = useActionState<AlertsState, FormData>(saveMyAlertsAction, {
    status: "idle",
  });
  const id = useId();
  const emailError = emailState.fieldErrors?.email;
  const currentError = emailState.fieldErrors?.current;
  const alertsHelpId = `${id}-alerts-help`;

  return (
    <div className="space-y-8">
      {!emailEnabled && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Email is not set up yet, so no alerts or password reset emails are sent.{" "}
          {canManageEmail ? "You can set it up in Settings > Email." : "Ask a Master Admin to set it up."} You can still save
          your email address now.
        </p>
      )}

      <form action={emailAction} className="max-w-sm space-y-4" noValidate>
        <div>
          <label htmlFor={`${id}-email`} className={labelClass}>
            Email address
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            maxLength={254}
            defaultValue={emailState.status === "error" ? emailState.email : (email ?? "")}
            placeholder="name@example.com"
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? `${id}-email-error ${id}-email-help` : `${id}-email-help`}
            className={inputClass(Boolean(emailError))}
          />
          {emailError && (
            <p id={`${id}-email-error`} className="mt-1.5 text-xs font-medium text-red-700">
              {emailError}
            </p>
          )}
          <p id={`${id}-email-help`} className="mt-1.5 text-xs text-slate-500">
            For new inquiry alerts, and to reset your password with Forgot password. Leave it empty to remove it.
          </p>
        </div>
        <div>
          <label htmlFor={`${id}-current`} className={labelClass}>
            Current password
          </label>
          <input
            id={`${id}-current`}
            name="current"
            type="password"
            autoComplete="current-password"
            maxLength={200}
            aria-invalid={currentError ? true : undefined}
            aria-describedby={currentError ? `${id}-current-error ${id}-current-help` : `${id}-current-help`}
            className={inputClass(Boolean(currentError))}
          />
          {currentError && (
            <p id={`${id}-current-error`} className="mt-1.5 text-xs font-medium text-red-700">
              {currentError}
            </p>
          )}
          <p id={`${id}-current-help`} className="mt-1.5 text-xs text-slate-500">
            Needed to change your email address, because it can be used to reset your password.
          </p>
        </div>
        <p
          role="status"
          aria-live="polite"
          className={`text-sm ${emailState.status === "error" ? "font-medium text-red-700" : "text-emerald-800"} ${
            emailState.message ? "" : "sr-only"
          }`}
        >
          {emailState.message}
        </p>
        <button type="submit" disabled={emailPending} className={primaryButton}>
          {emailPending ? "Saving…" : "Save email address"}
        </button>
      </form>

      <form action={alertsAction} className="max-w-xl space-y-3 border-t border-slate-200 pt-6">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            // Re-reads the saved choice after it changes.
            key={String(inquiryAlerts)}
            type="checkbox"
            name="inquiryAlerts"
            defaultChecked={inquiryAlerts}
            disabled={!email}
            aria-describedby={alertsHelpId}
            className="mt-0.5 h-4 w-4 accent-blue-900"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-900">Email me when a new inquiry arrives</span>
            <span id={alertsHelpId} className="block text-xs text-slate-600">
              {email
                ? `Alerts go to ${email}, with the visitor's details and a link to the inquiry.`
                : "Add your email address above first."}
            </span>
          </span>
        </label>
        <p
          role="status"
          aria-live="polite"
          className={`text-sm ${alertsState.status === "error" ? "font-medium text-red-700" : "text-emerald-800"} ${
            alertsState.message ? "" : "sr-only"
          }`}
        >
          {alertsState.message}
        </p>
        <button type="submit" disabled={alertsPending || !email} className={secondaryButton}>
          {alertsPending ? "Saving…" : "Save alert setting"}
        </button>
      </form>
    </div>
  );
}

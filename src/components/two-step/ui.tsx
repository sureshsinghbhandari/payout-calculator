"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { inputClass, linkButton } from "./styles";

/** Submit button for plain forms (no form state): shows `pendingLabel` while the action runs. */
export function SubmitButton({
  label,
  pendingLabel,
  className,
}: {
  label: string;
  pendingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : label}
    </button>
  );
}

/**
 * The code field. App codes get the number keypad and the phone's one-time
 * code autofill; with `allowRecovery`, a link switches to a text field for a
 * recovery code (letters and digits). The field is always named "code".
 */
export function CodeField({
  id,
  error,
  allowRecovery,
  label = "Code from your authenticator app",
}: {
  id: string;
  error?: string;
  allowRecovery: boolean;
  label?: string;
}) {
  const [recovery, setRecovery] = useState(false);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-slate-900">
        {recovery ? "Recovery code" : label}
      </label>
      <input
        // A new field when switching, so the keypad and autofill change too.
        key={recovery ? "recovery" : "app"}
        id={id}
        name="code"
        type="text"
        inputMode={recovery ? "text" : "numeric"}
        autoComplete={recovery ? "off" : "one-time-code"}
        pattern={recovery ? undefined : "[0-9 ]*"}
        maxLength={recovery ? 20 : 7}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        className={`${inputClass(error)} font-mono tracking-widest`}
      />
      <p id={hintId} className="mt-1.5 text-xs text-slate-500">
        {recovery
          ? "One of the recovery codes you saved when you set up two-step sign-in, like abcde-23456. Each code works once."
          : "The 6-digit code your app shows now. It changes every 30 seconds."}
      </p>
      {error && (
        <p id={errorId} className="mt-1 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
      {allowRecovery && (
        <button type="button" onClick={() => setRecovery((r) => !r)} className={`mt-2 ${linkButton}`}>
          {recovery ? "Use the code from my app instead" : "Lost your phone? Use a recovery code"}
        </button>
      )}
    </div>
  );
}

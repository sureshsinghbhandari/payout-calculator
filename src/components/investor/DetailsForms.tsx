"use client";

import { useActionState, useId } from "react";
import {
  requestBankChangeAction,
  requestContactChangeAction,
  withdrawChangeRequestAction,
  type ChangeRequestState,
  type WithdrawState,
} from "@/app/portal/details/actions";
import type { BankField, ContactChangeField } from "@/lib/profile-requests";

const inputClass =
  "mt-2 block w-full rounded-lg border bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm focus:outline-none focus:ring-2";
const okInput = "border-slate-300 focus:border-blue-700 focus:ring-blue-700/30";
const errorInput = "border-red-600 focus:ring-red-600/30";
const submitButton =
  "rounded-lg bg-blue-900 px-6 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70";

interface FieldSpec<F extends string> {
  name: F;
  label: string;
  type?: "text" | "email" | "tel";
  autoComplete: string;
  maxLength: number;
  optional?: boolean;
  hint?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}

/** A form of text fields that sends a change request; errors are shown under each field. */
function RequestForm<F extends string>({
  fields,
  defaults,
  state,
  formAction,
  pending,
  submitLabel,
}: {
  fields: FieldSpec<F>[];
  defaults: Partial<Record<F, string>>;
  state: ChangeRequestState<F>;
  formAction: (data: FormData) => void;
  pending: boolean;
  submitLabel: string;
}) {
  const id = useId();
  const values = { ...defaults, ...state.values };
  const errorText = state.fieldErrors ? Object.values<string | undefined>(state.fieldErrors).filter(Boolean).join(" ") : "";

  return (
    // A new key after every attempt shows the returned values.
    <form key={state.attempt ?? 0} action={formAction} className="mt-5 space-y-4">
      {fields.map((field) => {
        const error = state.fieldErrors?.[field.name];
        const describedBy = [field.hint ? `${id}-${field.name}-hint` : null, error ? `${id}-${field.name}-error` : null]
          .filter(Boolean)
          .join(" ");
        return (
          <div key={field.name}>
            <label htmlFor={`${id}-${field.name}`} className="text-sm font-semibold text-slate-900">
              {field.label}
              {field.optional && <span className="font-normal text-slate-500"> (optional)</span>}
            </label>
            <input
              id={`${id}-${field.name}`}
              name={field.name}
              type={field.type ?? "text"}
              defaultValue={values[field.name] ?? ""}
              required={!field.optional}
              autoComplete={field.autoComplete}
              inputMode={field.inputMode}
              maxLength={field.maxLength}
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy || undefined}
              className={`${inputClass} ${error ? errorInput : okInput}`}
            />
            {field.hint && (
              <p id={`${id}-${field.name}-hint`} className="mt-1.5 text-xs text-slate-500">
                {field.hint}
              </p>
            )}
            {error && (
              <p id={`${id}-${field.name}-error`} className="mt-1.5 text-xs font-medium text-red-700">
                {error}
              </p>
            )}
          </div>
        );
      })}
      {state.status === "error" && state.message && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.message}
          {errorText && <span className="sr-only"> {errorText}</span>}
        </p>
      )}
      <button type="submit" disabled={pending} className={submitButton}>
        {pending ? "Sending…" : submitLabel}
      </button>
    </form>
  );
}

const CONTACT_FIELD_SPECS: FieldSpec<ContactChangeField>[] = [
  { name: "email", label: "Email", type: "email", autoComplete: "email", maxLength: 254 },
  { name: "phone", label: "Phone", type: "tel", autoComplete: "tel", maxLength: 25, optional: true },
];

export function ContactChangeForm({ current }: { current: { email: string; phone: string } }) {
  const [state, formAction, pending] = useActionState<ChangeRequestState<ContactChangeField>, FormData>(
    requestContactChangeAction,
    {},
  );
  return (
    <RequestForm
      fields={CONTACT_FIELD_SPECS}
      defaults={current}
      state={state}
      formAction={formAction}
      pending={pending}
      submitLabel="Send change for review"
    />
  );
}

const BANK_FIELD_SPECS: FieldSpec<BankField>[] = [
  { name: "accountHolder", label: "Name on the account", autoComplete: "off", maxLength: 100 },
  { name: "bankName", label: "Bank name", autoComplete: "off", maxLength: 100 },
  {
    name: "routingCode",
    label: "Routing number or sort code",
    autoComplete: "off",
    maxLength: 20,
    hint: "The code that identifies your bank branch, for example a 9-digit routing number or a 6-digit sort code.",
  },
  {
    name: "accountNumber",
    label: "Account number",
    autoComplete: "off",
    maxLength: 40,
    inputMode: "text",
    hint: "Your account number or IBAN.",
  },
];

export function BankChangeForm({ accountHolder }: { accountHolder: string }) {
  const [state, formAction, pending] = useActionState<ChangeRequestState<BankField>, FormData>(requestBankChangeAction, {});
  return (
    <RequestForm
      fields={BANK_FIELD_SPECS}
      defaults={{ accountHolder }}
      state={state}
      formAction={formAction}
      pending={pending}
      submitLabel="Send bank details for review"
    />
  );
}

/** Withdraws a pending request (bound to the request on the page). */
export function WithdrawRequestButton({ requestId, label }: { requestId: string; label: string }) {
  const [state, formAction, pending] = useActionState<WithdrawState, FormData>(withdrawChangeRequestAction, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("Withdraw this request? You can send a new one afterwards.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="requestId" value={requestId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={label}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Withdrawing…" : "Withdraw request"}
      </button>
      {state.message && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
          {state.message}
        </p>
      )}
    </form>
  );
}

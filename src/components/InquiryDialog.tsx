"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { submitInquiryAction, type InquiryState } from "@/app/inquiry-actions";
import { INQUIRY_LIMITS, type InquiryField } from "@/lib/inquiry";
import { formatCents, formatDollars, formatIsoDate, formatYears } from "@/lib/format";
import { FREQUENCY_LABELS, PAYOUT_TYPE_LABELS } from "@/lib/payout";
import type { PublicSchedule } from "@/lib/scenarios";

const inputClass =
  "mt-1.5 block w-full rounded-lg border bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm focus:outline-none focus:ring-2";
const okClass = "border-slate-300 focus:border-blue-700 focus:ring-blue-700/30";
const errorClass = "border-red-600 focus:border-red-600 focus:ring-red-600/30";

interface FormProps {
  plan: PublicSchedule;
  onCancel: () => void;
}

function InquiryForm({ plan, onCancel }: FormProps) {
  const [state, formAction, pending] = useActionState<InquiryState, FormData>(submitInquiryAction, {
    status: "idle",
  });
  const baseId = useId();
  const { inputs, totals } = plan;

  if (state.status === "sent") {
    return (
      <div className="space-y-4 p-6 sm:p-8">
        <h2 className="text-xl font-semibold text-slate-900">Thank you</h2>
        <p role="status" className="text-sm leading-relaxed text-slate-700">
          We received your inquiry and will contact you soon. Your reference is{" "}
          <span className="font-semibold tabular-nums text-slate-900">{state.reference}</span>.
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-blue-900 px-6 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const field = (name: InquiryField) => {
    const id = `${baseId}-${name}`;
    const error = state.fieldErrors?.[name];
    return {
      id,
      name,
      defaultValue: state.values?.[name] ?? "",
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? `${id}-error` : undefined,
      className: `${inputClass} ${error ? errorClass : okClass}`,
    };
  };
  const errorText = (name: InquiryField) => {
    const error = state.fieldErrors?.[name];
    return error ? (
      <p id={`${baseId}-${name}-error`} className="mt-1 text-xs font-medium text-red-700">
        {error}
      </p>
    ) : null;
  };

  const summary = [
    { label: "Investment amount", value: formatDollars(inputs.principal) },
    { label: "Planned investment date", value: formatIsoDate(inputs.investmentDate) },
    { label: "Term locked", value: formatYears(inputs.lockInYears) },
    { label: "Payout term", value: FREQUENCY_LABELS[inputs.frequency] },
    { label: "Payout type", value: PAYOUT_TYPE_LABELS[inputs.payoutType] },
    { label: "Total amount paid", value: formatCents(totals.payoutCents) },
  ];

  return (
    <form action={formAction} noValidate className="space-y-5 p-6 sm:p-8">
      <div>
        <h2 id={`${baseId}-title`} className="text-xl font-semibold text-slate-900">
          Send an inquiry
        </h2>
        <p className="mt-1 text-sm text-slate-600">Share your details and we will contact you about this plan.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your plan</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {summary.map((item) => (
            <div key={item.label}>
              <dt className="text-xs text-slate-500">{item.label}</dt>
              <dd className="font-medium text-slate-900">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Plan details travel with the inquiry; the server recalculates the totals. */}
      <input type="hidden" name="principal" value={inputs.principal} />
      <input type="hidden" name="lockInYears" value={inputs.lockInYears} />
      <input type="hidden" name="frequency" value={inputs.frequency} />
      <input type="hidden" name="payoutType" value={inputs.payoutType} />
      <input type="hidden" name="investmentDate" value={inputs.investmentDate} />
      {/* Honeypot: hidden from people, often filled in by spam bots. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={`${baseId}-name`} className="text-sm font-semibold text-slate-900">
            Full name
          </label>
          <input
            {...field("name")}
            type="text"
            autoComplete="name"
            maxLength={INQUIRY_LIMITS.name}
            required
          />
          {errorText("name")}
        </div>
        <div>
          <label htmlFor={`${baseId}-email`} className="text-sm font-semibold text-slate-900">
            Email
          </label>
          <input {...field("email")} type="email" autoComplete="email" maxLength={INQUIRY_LIMITS.email} required />
          {errorText("email")}
        </div>
        <div>
          <label htmlFor={`${baseId}-phone`} className="text-sm font-semibold text-slate-900">
            Phone <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input {...field("phone")} type="tel" autoComplete="tel" maxLength={INQUIRY_LIMITS.phone} />
          {errorText("phone")}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${baseId}-message`} className="text-sm font-semibold text-slate-900">
            Message <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <textarea {...field("message")} rows={4} maxLength={INQUIRY_LIMITS.message} />
          {errorText("message")}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        We store the details you send so our team can respond to your inquiry.
      </p>

      {state.status === "error" && (state.message || state.fieldErrors?.plan) && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {state.fieldErrors?.plan ?? state.message}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-base font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-900 px-6 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? "Sending…" : "Send inquiry"}
        </button>
      </div>
    </form>
  );
}

interface DialogProps {
  open: boolean;
  plan: PublicSchedule;
  onClose: () => void;
}

/** Modal inquiry form using the native <dialog> element (focus trap, Esc to close). */
export function InquiryDialog({ open, plan, onClose }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // Clicking the backdrop (outside the panel) closes the dialog.
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto max-h-[92vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-left shadow-xl backdrop:bg-slate-900/50"
    >
      <span id={titleId} className="sr-only">
        Send an inquiry
      </span>
      {/* Unmounting on close gives a fresh, empty form next time. */}
      {open && <InquiryForm plan={plan} onCancel={onClose} />}
    </dialog>
  );
}

"use client";

import { useActionState, useId } from "react";
import { decidePrivacyRequestAction, type DecidePrivacyState } from "@/app/admin/privacy-requests/actions";
import {
  PRIVACY_KIND_LABELS,
  PRIVACY_REASON_MAX,
  PRIVACY_STATUS_BADGES,
  PRIVACY_STATUS_LABELS,
  type PrivacyRequest,
} from "@/lib/privacy-requests";
import { formatTimestamp } from "./fields";
import { dangerButton, errorNotice, inputClass, primaryButton } from "./ui";

interface Props {
  investorId: string;
  request: PrivacyRequest;
}

/** One pending privacy request with Mark as fulfilled and Decline (with an optional reason). */
export function PrivacyRequestReview({ investorId, request }: Props) {
  const [state, formAction, pending] = useActionState<DecidePrivacyState, FormData>(decidePrivacyRequestAction, {});
  const reasonId = useId();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{PRIVACY_KIND_LABELS[request.kind]}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIVACY_STATUS_BADGES[request.status]}`}>
          {PRIVACY_STATUS_LABELS[request.status]}
        </span>
        <span className="text-xs text-slate-500">Requested {formatTimestamp(request.requestedAt)}</span>
      </div>

      {request.note && <p className="text-sm text-slate-700">Note from the investor: {request.note}</p>}
      {request.kind === "deletion" && (
        <p className="text-xs text-slate-600">
          Marking this fulfilled does not delete anything by itself. Remove the account yourself (Investors), or send
          the data, before marking it fulfilled.
        </p>
      )}

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="investorId" value={investorId} />
        <input type="hidden" name="requestId" value={request.id} />
        <div>
          <label htmlFor={reasonId} className="text-sm font-semibold text-slate-900">
            Reason <span className="font-normal text-slate-500">(optional, shown to the investor)</span>
          </label>
          <textarea
            id={reasonId}
            name="reason"
            rows={2}
            maxLength={PRIVACY_REASON_MAX}
            aria-invalid={state.fieldError ? true : undefined}
            aria-describedby={state.fieldError ? `${reasonId}-error` : undefined}
            className={inputClass(state.fieldError)}
          />
          {state.fieldError && (
            <p id={`${reasonId}-error`} className="mt-1.5 text-xs font-medium text-red-700">
              {state.fieldError}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" name="decision" value="fulfill" disabled={pending} className={primaryButton}>
            {pending ? "Saving…" : "Mark as fulfilled"}
          </button>
          <button type="submit" name="decision" value="decline" disabled={pending} className={dangerButton}>
            Decline
          </button>
        </div>
        {state.status === "error" && !state.fieldError && (
          <p role="alert" className={errorNotice}>
            {state.message}
          </p>
        )}
      </form>
    </div>
  );
}

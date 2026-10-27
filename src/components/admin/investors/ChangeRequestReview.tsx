"use client";

import { useActionState, useId } from "react";
import {
  decideChangeRequestAction,
  type DecideState,
  type RevealResult,
} from "@/app/admin/investors/request-actions";
import { BankDetailsSummary } from "@/components/BankDetailsSummary";
import {
  CHANGE_KIND_LABELS,
  CHANGE_STATUS_BADGES,
  CHANGE_STATUS_LABELS,
  maskedAccountNumber,
  REASON_MAX,
  type ChangeRequestView,
  type MaskedBankDetails,
} from "@/lib/profile-requests";
import { formatTimestamp } from "./fields";
import { dangerButton, errorNotice, inputClass, primaryButton } from "./ui";

interface Props {
  investorId: string;
  request: ChangeRequestView;
  /** The investor's details now, to compare with. */
  current: { email: string; phone: string; bank: MaskedBankDetails | null };
  /** Shows the full requested account number (bound to the request on the server). */
  reveal?: () => Promise<RevealResult>;
  /** The page this is shown on, which is shown again after the decision. */
  from: "investor" | "requests";
}

/** One pending change request with Approve and Reject (with an optional reason). */
export function ChangeRequestReview({ investorId, request, current, reveal, from }: Props) {
  const [state, formAction, pending] = useActionState<DecideState, FormData>(decideChangeRequestAction, {});
  const reasonId = useId();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{CHANGE_KIND_LABELS[request.kind]}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHANGE_STATUS_BADGES[request.status]}`}>
          {CHANGE_STATUS_LABELS[request.status]}
        </span>
        <span className="text-xs text-slate-500">Requested {formatTimestamp(request.requestedAt)}</span>
      </div>

      {request.kind === "contact" && request.contact && (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Compare label="Email" now={current.email} next={request.contact.email} />
          <Compare label="Phone" now={current.phone} next={request.contact.phone} />
        </dl>
      )}

      {request.kind === "bank" && (
        <div className="space-y-3">
          {request.bank ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-900">New bank details</p>
              <BankDetailsSummary details={request.bank} reveal={reveal} />
            </div>
          ) : (
            <p role="alert" className={errorNotice}>
              The new bank details (account ending {request.bankLast4 ?? "?"}) could not be read. Reject this request and
              ask the investor to send them again.
            </p>
          )}
          <p className="text-xs text-slate-600">
            Current bank details:{" "}
            {current.bank
              ? `${current.bank.bankName}, account ${maskedAccountNumber(current.bank.accountLast4)}`
              : "none on file"}
          </p>
        </div>
      )}

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="investorId" value={investorId} />
        <input type="hidden" name="requestId" value={request.id} />
        <input type="hidden" name="from" value={from} />
        <div>
          <label htmlFor={reasonId} className="text-sm font-semibold text-slate-900">
            Reason <span className="font-normal text-slate-500">(optional, shown to the investor)</span>
          </label>
          <textarea
            id={reasonId}
            name="reason"
            rows={2}
            maxLength={REASON_MAX}
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
          <button
            type="submit"
            name="decision"
            value="approve"
            disabled={pending || (request.kind === "bank" && !request.bank)}
            className={primaryButton}
          >
            {pending ? "Saving…" : "Approve and apply"}
          </button>
          <button type="submit" name="decision" value="reject" disabled={pending} className={dangerButton}>
            Reject
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

function Compare({ label, now, next }: { label: string; now: string; next: string }) {
  const changed = now !== next;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words">
        {changed ? (
          <>
            <span className="text-slate-500 line-through">{now || "(none)"}</span>
            <span aria-hidden="true"> → </span>
            <span className="sr-only"> changes to </span>
            <span className="font-semibold text-slate-900">{next || "(none)"}</span>
          </>
        ) : (
          <span className="text-slate-700">{now || "(none)"} (no change)</span>
        )}
      </dd>
    </div>
  );
}

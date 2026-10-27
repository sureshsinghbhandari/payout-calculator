"use client";

import { useState, useTransition } from "react";
import type { RevealResult } from "@/app/admin/investors/request-actions";
import { maskedAccountNumber, type MaskedBankDetails } from "@/lib/profile-requests";

/**
 * Bank details with the account number masked to its last 4 characters.
 * `reveal` (Master Admins only: a server action bound to the investor or
 * request) adds a Show button for the full number.
 */
export function BankDetailsSummary({
  details,
  reveal,
}: {
  details: MaskedBankDetails;
  reveal?: () => Promise<RevealResult>;
}) {
  const [shown, setShown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (shown) {
      setShown(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = reveal ? await reveal() : null;
        if (result?.ok) setShown(result.accountNumber);
        else if (result) setError(result.error);
      } catch {
        setError("The account number could not be loaded. Please try again.");
      }
    });
  }

  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account holder</dt>
        <dd className="mt-0.5 break-words text-slate-900">{details.accountHolder}</dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bank</dt>
        <dd className="mt-0.5 break-words text-slate-900">{details.bankName}</dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Routing number or sort code</dt>
        <dd className="mt-0.5 font-mono text-slate-900">{details.routingCode}</dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account number</dt>
        <dd className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="break-all font-mono text-slate-900">{shown ?? maskedAccountNumber(details.accountLast4)}</span>
          {reveal && (
            <button
              type="button"
              onClick={toggle}
              disabled={pending}
              aria-pressed={shown !== null}
              className="text-sm font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950 disabled:cursor-wait disabled:opacity-60"
            >
              {pending ? "Loading…" : shown ? "Hide" : "Show"}
              <span className="sr-only"> full account number</span>
            </button>
          )}
        </dd>
        {error && (
          <p role="alert" className="mt-1 text-xs font-medium text-red-700">
            {error}
          </p>
        )}
      </div>
    </dl>
  );
}

"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { recordPaymentAction, removePaymentAction, type PaymentState } from "@/app/admin/investors/actions";
import type { PayoutPayment } from "@/lib/accounts";
import { formatCents, formatIsoDate } from "@/lib/format";
import { centsToInput } from "@/lib/investments";
import { REFERENCE_MAX } from "./fields";
import { TextField } from "./FormControls";
import { dangerButton, errorNotice, primaryButton, secondaryButton } from "./ui";

interface Props {
  investorId: string;
  investmentId: string;
  payoutNumber: number;
  payoutDate: string;
  scheduledCents: number;
  payment: PayoutPayment | null;
  /** Earliest and latest dates a payment may be recorded for, YYYY-MM-DD. */
  earliest: string;
  latest: string;
  /** Today's date in UTC: the default paid date for payouts already due. */
  today: string;
  /** Why no payment confirmation can be emailed to the investor, or null when it can. */
  confirmationBlocker: string | null;
}

const smallButton =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700";

/**
 * "Mark as paid" (or "Edit payment") for one scheduled payout: a dialog with
 * the date paid, the amount (prefilled with the scheduled amount) and a
 * reference. A recorded payment can also be removed from the same dialog.
 * When marking as paid, the investor can be emailed a payment confirmation
 * (ticked by default; not ticked when changing a recorded payment).
 */
export function PayoutPaymentControl(props: Props) {
  const { payment, payoutNumber, payoutDate, scheduledCents } = props;
  const [saveState, saveAction, saving] = useActionState<PaymentState, FormData>(recordPaymentAction, {});
  const [removeState, removeAction, removing] = useActionState<PaymentState, FormData>(removePaymentAction, {});
  const dialog = useRef<HTMLDialogElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const titleId = useId();
  const notifyId = useId();

  // Close once saved or removed; the page refreshes with the new status.
  useEffect(() => {
    if (saveState.status === "saved") dialog.current?.close();
    else if (saveState.status === "error" && !saveState.fieldErrors) errorRef.current?.focus();
  }, [saveState]);
  useEffect(() => {
    if (removeState.status === "saved") dialog.current?.close();
    else if (removeState.status === "error") errorRef.current?.focus();
  }, [removeState]);

  const hidden = (
    <>
      <input type="hidden" name="investorId" value={props.investorId} />
      <input type="hidden" name="investmentId" value={props.investmentId} />
      <input type="hidden" name="payoutNumber" value={payoutNumber} />
    </>
  );
  // A payment for a payout not yet due is most likely paid early, today.
  const defaultPaidOn = payment?.paidOn ?? (payoutDate <= props.today ? payoutDate : props.today);
  const values = {
    paidOn: defaultPaidOn,
    amount: centsToInput(payment?.amountCents ?? scheduledCents),
    reference: payment?.reference ?? "",
    ...saveState.values,
  };
  const errors = saveState.fieldErrors ?? {};
  const error = saveState.status === "error" ? saveState.message : removeState.status === "error" ? removeState.message : null;

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={`${payment ? "Edit payment of" : "Mark as paid:"} payout ${payoutNumber}`}
        className={smallButton}
      >
        {payment ? "Edit payment" : "Mark as paid"}
      </button>
      {saveState.status === "saved" && saveState.email && (
        <p role="status" className="mt-1 max-w-[14rem] whitespace-normal text-xs text-slate-600">
          {saveState.email}
        </p>
      )}
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="m-auto w-[calc(100%-2rem)] max-w-lg whitespace-normal rounded-2xl border border-slate-200 bg-white p-0 text-left font-normal normal-nums text-slate-900 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="space-y-4 p-5">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {payment ? `Payment of payout ${payoutNumber}` : `Mark payout ${payoutNumber} as paid`}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Scheduled for {formatIsoDate(payoutDate)}: {formatCents(scheduledCents)}.
              {payment && <> Recorded by {payment.recordedBy || "an admin"}.</>} The investor sees it as Paid with the date
              paid.
            </p>
          </div>

          {error && (
            <p ref={errorRef} tabIndex={-1} role="alert" className={`${errorNotice} focus:outline-none`}>
              {error}
            </p>
          )}

          {/* A new key after every submission or saved change re-mounts the fields with current values. */}
          <form key={`${saveState.attempt ?? 0}-${payment?.recordedAt ?? "unpaid"}`} action={saveAction} className="space-y-4">
            {hidden}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Date paid"
                name="paidOn"
                type="date"
                min={props.earliest}
                max={props.latest}
                defaultValue={values.paidOn}
                error={errors.paidOn}
              />
              <TextField
                label="Amount paid (US$)"
                name="amount"
                inputMode="decimal"
                defaultValue={values.amount}
                error={errors.amount}
                autoComplete="off"
                maxLength={20}
              />
            </div>
            <TextField
              label="Reference"
              name="reference"
              defaultValue={values.reference}
              error={errors.reference}
              optional
              autoComplete="off"
              spellCheck={false}
              maxLength={REFERENCE_MAX}
              hint="For example the bank transfer id. The investor sees it in their statement."
            />
            {props.confirmationBlocker ? (
              <p className="text-sm text-slate-600">{props.confirmationBlocker}</p>
            ) : (
              <div className="flex items-start gap-3">
                <input
                  id={notifyId}
                  name="notify"
                  type="checkbox"
                  defaultChecked={!payment}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-400 text-blue-900 focus:ring-2 focus:ring-blue-700"
                />
                <label htmlFor={notifyId} className="text-sm text-slate-800">
                  <span className="font-semibold">Email the investor a payment confirmation</span>
                  <span className="block text-slate-600">With the amount, date paid and reference. Never the interest rate.</span>
                </label>
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => dialog.current?.close()} className={secondaryButton}>
                Cancel
              </button>
              <button type="submit" disabled={saving || removing} className={primaryButton}>
                {saving ? "Saving…" : payment ? "Save changes" : "Mark as paid"}
              </button>
            </div>
          </form>

          {payment && (
            <form action={removeAction} className="border-t border-slate-200 pt-4">
              {hidden}
              <p className="text-sm text-slate-600">
                Recorded by mistake? Remove the payment and the payout shows as Due or Upcoming again.
              </p>
              <button type="submit" disabled={saving || removing} className={`mt-3 ${dangerButton}`}>
                {removing ? "Removing…" : "Remove payment"}
              </button>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}

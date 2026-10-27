"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { addInvestmentAction, type AddInvestmentState } from "@/app/admin/investors/actions";
import type { ProductSettings } from "@/lib/products";
import type { RateTable } from "@/lib/rates";
import type { PlanField } from "./fields";
import { InvestmentPlanFields } from "./InvestmentPlanFields";
import { errorNotice, primaryButton, secondaryButton } from "./ui";

interface Props {
  investorId: string;
  /** The matured investment being renewed, or null for a new investment. */
  renewedFromId: string | null;
  defaults: Record<PlanField, string>;
  rates: RateTable;
  /** The amounts, terms and payout terms on offer. */
  products: ProductSettings;
}

/** Adds another investment to an investor, or renews a matured one. */
export function AddInvestmentForm(props: Props) {
  const [state, formAction, pending] = useActionState<AddInvestmentState, FormData>(addInvestmentAction, {});
  // A new key after every submission re-mounts the fields with the values the server returned.
  return <AddFormBody key={state.attempt ?? 0} {...props} state={state} formAction={formAction} pending={pending} />;
}

function AddFormBody({
  investorId,
  renewedFromId,
  defaults,
  rates,
  products,
  state,
  formAction,
  pending,
}: Props & { state: AddInvestmentState; formAction: (data: FormData) => void; pending: boolean }) {
  const values = { ...defaults, ...state.values };
  const errorRef = useRef<HTMLParagraphElement>(null);
  const submitLabel = renewedFromId ? "Renew investment" : "Add investment";

  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state.error]);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="id" value={investorId} />
      {renewedFromId && <input type="hidden" name="renewedFromId" value={renewedFromId} />}

      {state.error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className={`${errorNotice} focus:outline-none`}>
          {state.error}
        </p>
      )}

      <section
        aria-labelledby="add-investment-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
      >
        <h2 id="add-investment-heading" className="text-base font-semibold text-slate-900">
          {renewedFromId ? "New investment" : "Investment"}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {renewedFromId
            ? "Filled in from the matured investment, starting on its maturity date. Change anything the investor chose differently."
            : "The plan the investor chose. The investor sees it in the portal as soon as it is saved."}
        </p>
        <div className="mt-5">
          <InvestmentPlanFields
            values={values}
            errors={state.fieldErrors ?? {}}
            rates={rates}
            products={products}
            submitLabel={submitLabel}
            dateLabel={renewedFromId ? "Investment date" : "Planned investment date"}
            dateHint={renewedFromId ? "The maturity date of the investment being renewed." : undefined}
          />
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Link href={`/admin/investors/${encodeURIComponent(investorId)}`} className={secondaryButton}>
          Cancel
        </Link>
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

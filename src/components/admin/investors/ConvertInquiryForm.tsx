"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { convertInquiryAction, type ConvertState } from "@/app/admin/investors/actions";
import type { RateTable } from "@/lib/rates";
import type { ConvertField } from "./fields";
import { TextField } from "./FormControls";
import { InvestmentPlanFields } from "./InvestmentPlanFields";
import { errorNotice, primaryButton, secondaryButton } from "./ui";

interface Props {
  inquiryId: string;
  defaults: Record<ConvertField, string>;
  /** Current rates (admins may see them); the rate in effect at submission is stored. */
  rates: RateTable;
}

/** Form that converts a contacted inquiry into an investor with one investment. */
export function ConvertInquiryForm(props: Props) {
  const [state, formAction, pending] = useActionState<ConvertState, FormData>(convertInquiryAction, {});
  // A new key after every submission re-mounts the fields with the values the server returned.
  return <ConvertFormBody key={state.attempt ?? 0} {...props} state={state} formAction={formAction} pending={pending} />;
}

function ConvertFormBody({
  inquiryId,
  defaults,
  rates,
  state,
  formAction,
  pending,
}: Props & { state: ConvertState; formAction: (data: FormData) => void; pending: boolean }) {
  const values = { ...defaults, ...state.values };
  const errors = state.fieldErrors ?? {};
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state.error]);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="inquiryId" value={inquiryId} />

      {state.error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className={`${errorNotice} focus:outline-none`}>
          {state.error}
        </p>
      )}

      <section
        aria-labelledby="convert-investor-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
      >
        <h2 id="convert-investor-heading" className="text-base font-semibold text-slate-900">
          Investor details
        </h2>
        <p className="mt-1 text-sm text-slate-600">Taken from the inquiry. Check them before converting.</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <TextField label="Name" name="name" defaultValue={values.name} error={errors.name} autoComplete="off" maxLength={100} />
          <TextField
            label="Username"
            name="username"
            defaultValue={values.username}
            error={errors.username}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={32}
            hint="The investor signs in with this. 3 to 32 lowercase letters, digits, dots, underscores or hyphens."
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            defaultValue={values.email}
            error={errors.email}
            autoComplete="off"
            spellCheck={false}
            maxLength={254}
          />
          <TextField
            label="Phone"
            name="phone"
            type="tel"
            defaultValue={values.phone}
            error={errors.phone}
            autoComplete="off"
            optional
            maxLength={25}
          />
        </div>
      </section>

      <section
        aria-labelledby="convert-investment-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
      >
        <h2 id="convert-investment-heading" className="text-base font-semibold text-slate-900">
          Investment
        </h2>
        <p className="mt-1 text-sm text-slate-600">The plan from the inquiry. Change it if the investor chose differently.</p>
        <div className="mt-5">
          <InvestmentPlanFields
            values={{
              principal: values.principal,
              investmentDate: values.investmentDate,
              lockInYears: values.lockInYears,
              frequency: values.frequency,
              payoutType: values.payoutType,
            }}
            errors={errors}
            rates={rates}
            submitLabel="Convert to investor"
          />
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Link href="/admin/inquiries" className={secondaryButton}>
          Cancel
        </Link>
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Converting…" : "Convert to investor"}
        </button>
      </div>
    </form>
  );
}

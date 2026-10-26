"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { convertInquiryAction, type ConvertState } from "@/app/admin/investors/actions";
import { INVESTMENT_AMOUNTS, INVESTMENT_DATE_MAX, INVESTMENT_DATE_MIN, LOCK_IN_YEARS } from "@/lib/config";
import { formatCents, formatDollars, formatIsoDateLong, formatPercent, formatYears } from "@/lib/format";
import {
  calculatePayoutSchedule,
  FREQUENCY_LABELS,
  PAYOUT_TYPE_LABELS,
  type PayoutFrequency,
  type PayoutSchedule,
  type PayoutType,
} from "@/lib/payout";
import type { RateTable } from "@/lib/rates";
import type { ConvertField, PlanField } from "./fields";
import { SelectField, TextField } from "./FormControls";
import { errorNotice, primaryButton, secondaryButton } from "./ui";

interface Props {
  inquiryId: string;
  defaults: Record<ConvertField, string>;
  /** Current rates (admins may see them); the rate in effect at submission is stored. */
  rates: RateTable;
}

const AMOUNT_OPTIONS = INVESTMENT_AMOUNTS.map((a) => ({ value: String(a), label: formatDollars(a) }));
const TERM_OPTIONS = LOCK_IN_YEARS.map((y) => ({ value: String(y), label: formatYears(y) }));
const FREQUENCY_OPTIONS = (Object.keys(FREQUENCY_LABELS) as PayoutFrequency[]).map((f) => ({
  value: f,
  label: FREQUENCY_LABELS[f],
}));
const TYPE_OPTIONS = (Object.keys(PAYOUT_TYPE_LABELS) as PayoutType[]).map((t) => ({
  value: t,
  label: PAYOUT_TYPE_LABELS[t],
}));

/** Form that converts a contacted inquiry into an investor with one investment. */
export function ConvertInquiryForm(props: Props) {
  const [state, formAction, pending] = useActionState<ConvertState, FormData>(convertInquiryAction, {});
  // A new key after every submission re-mounts the fields with the values the server returned.
  return <ConvertFormBody key={state.attempt ?? 0} {...props} state={state} formAction={formAction} pending={pending} />;
}

type PlanDraft = Record<PlanField, string>;

function readPlan(form: HTMLFormElement): PlanDraft {
  const data = new FormData(form);
  const get = (name: PlanField) => {
    const value = data.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    principal: get("principal"),
    investmentDate: get("investmentDate"),
    lockInYears: get("lockInYears"),
    frequency: get("frequency"),
    payoutType: get("payoutType"),
  };
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
  const [plan, setPlan] = useState<PlanDraft>(() => ({
    principal: values.principal,
    investmentDate: values.investmentDate,
    lockInYears: values.lockInYears,
    frequency: values.frequency,
    payoutType: values.payoutType,
  }));
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state.error]);

  return (
    <form action={formAction} onChange={(e) => setPlan(readPlan(e.currentTarget))} className="space-y-6">
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
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField
            label="Investment amount"
            name="principal"
            defaultValue={values.principal}
            error={errors.principal}
            options={AMOUNT_OPTIONS}
          />
          <TextField
            label="Planned investment date"
            name="investmentDate"
            type="date"
            min={INVESTMENT_DATE_MIN}
            max={INVESTMENT_DATE_MAX}
            defaultValue={values.investmentDate}
            error={errors.investmentDate}
          />
          <SelectField
            label="Term locked"
            name="lockInYears"
            defaultValue={values.lockInYears}
            error={errors.lockInYears}
            options={TERM_OPTIONS}
          />
          <SelectField
            label="Payout term"
            name="frequency"
            defaultValue={values.frequency}
            error={errors.frequency}
            options={FREQUENCY_OPTIONS}
          />
          <SelectField
            label="Payout type"
            name="payoutType"
            defaultValue={values.payoutType}
            error={errors.payoutType}
            options={TYPE_OPTIONS}
          />
        </div>
        <PlanPreview plan={plan} rates={rates} />
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

function previewSchedule(plan: PlanDraft, rates: RateTable): { rate: number | null; schedule: PayoutSchedule | null } {
  if (!Object.hasOwn(FREQUENCY_LABELS, plan.frequency)) return { rate: null, schedule: null };
  const frequency = plan.frequency as PayoutFrequency;
  const rate = rates[frequency];
  try {
    return {
      rate,
      schedule: calculatePayoutSchedule({
        principal: Number(plan.principal),
        annualRatePercent: rate,
        lockInYears: Number(plan.lockInYears),
        payoutType: plan.payoutType as PayoutType,
        frequency,
        investmentDate: plan.investmentDate,
      }),
    };
  } catch {
    return { rate, schedule: null };
  }
}

/** Rate and totals for the plan as currently selected (information only; the server recalculates). */
function PlanPreview({ plan, rates }: { plan: PlanDraft; rates: RateTable }) {
  const { rate, schedule } = previewSchedule(plan, rates);
  const frequencyLabel = Object.hasOwn(FREQUENCY_LABELS, plan.frequency)
    ? FREQUENCY_LABELS[plan.frequency as PayoutFrequency]
    : null;
  const items = schedule
    ? [
        { label: "Interest starts", value: formatIsoDateLong(schedule.startDate) },
        { label: "Total interest", value: formatCents(schedule.totals.interestCents) },
        { label: "Total amount paid", value: formatCents(schedule.totals.payoutCents) },
      ]
    : [];

  return (
    <div aria-live="polite" className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-700">
        <span className="font-semibold text-slate-900">Annual rate: {rate === null ? "–" : formatPercent(rate)}</span>
        {frequencyLabel && <> (current {frequencyLabel} rate)</>}. The rate in effect when you select Convert to investor is
        stored with the investment. Investors never see it.
      </p>
      {schedule ? (
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.label}>
              <dt className="text-xs text-slate-500">{item.label}</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-slate-600">Choose a valid plan and date to see the totals.</p>
      )}
    </div>
  );
}

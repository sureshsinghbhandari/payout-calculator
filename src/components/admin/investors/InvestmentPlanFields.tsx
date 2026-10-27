"use client";

import { useState } from "react";
import { INVESTMENT_DATE_MAX, INVESTMENT_DATE_MIN } from "@/lib/config";
import { formatCents, formatDollars, formatIsoDateLong, formatPercent, formatYears } from "@/lib/format";
import {
  calculatePayoutSchedule,
  FREQUENCY_LABELS,
  PAYOUT_TYPE_LABELS,
  type PayoutFrequency,
  type PayoutSchedule,
  type PayoutType,
} from "@/lib/payout";
import type { ProductSettings } from "@/lib/products";
import type { RateTable } from "@/lib/rates";
import type { FieldErrors, PlanField } from "./fields";
import { SelectField, TextField } from "./FormControls";

const TYPE_OPTIONS = (Object.keys(PAYOUT_TYPE_LABELS) as PayoutType[]).map((t) => ({
  value: t,
  label: PAYOUT_TYPE_LABELS[t],
}));

export type PlanDraft = Record<PlanField, string>;

function readPlan(container: HTMLElement): PlanDraft {
  const get = (name: PlanField) => {
    const field = container.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
    return field?.value ?? "";
  };
  return {
    principal: get("principal"),
    investmentDate: get("investmentDate"),
    lockInYears: get("lockInYears"),
    frequency: get("frequency"),
    payoutType: get("payoutType"),
  };
}

/**
 * The investment plan fields (amount, date, term, payout term and type) with a
 * live preview of the current rate and totals. Used when converting an inquiry
 * and when adding or renewing an investment.
 */
export function InvestmentPlanFields({
  values,
  errors,
  rates,
  products,
  submitLabel,
  dateLabel = "Planned investment date",
  dateHint,
}: {
  values: PlanDraft;
  errors: FieldErrors<PlanField>;
  /** The amounts, terms and payout terms on offer; only these can be chosen. */
  products: ProductSettings;
  /** Current rates (admins may see them); the rate in effect at submission is stored. */
  rates: RateTable;
  /** The submit button's text, named in the rate note. */
  submitLabel: string;
  dateLabel?: string;
  dateHint?: string;
}) {
  const [plan, setPlan] = useState<PlanDraft>(values);
  const amountOptions = products.amounts.map((a) => ({ value: String(a), label: formatDollars(a) }));
  const termOptions = products.terms.map((y) => ({ value: String(y), label: formatYears(y) }));
  const frequencyOptions = products.frequencies.map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }));

  return (
    <div onChange={(e) => setPlan(readPlan(e.currentTarget))}>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label="Investment amount"
          name="principal"
          defaultValue={values.principal}
          error={errors.principal}
          options={amountOptions}
        />
        <TextField
          label={dateLabel}
          name="investmentDate"
          type="date"
          min={INVESTMENT_DATE_MIN}
          max={INVESTMENT_DATE_MAX}
          defaultValue={values.investmentDate}
          error={errors.investmentDate}
          hint={dateHint}
        />
        <SelectField
          label="Term locked"
          name="lockInYears"
          defaultValue={values.lockInYears}
          error={errors.lockInYears}
          options={termOptions}
        />
        <SelectField
          label="Payout term"
          name="frequency"
          defaultValue={values.frequency}
          error={errors.frequency}
          options={frequencyOptions}
        />
        <SelectField
          label="Payout type"
          name="payoutType"
          defaultValue={values.payoutType}
          error={errors.payoutType}
          options={TYPE_OPTIONS}
        />
      </div>
      <PlanPreview plan={plan} rates={rates} submitLabel={submitLabel} />
    </div>
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
function PlanPreview({ plan, rates, submitLabel }: { plan: PlanDraft; rates: RateTable; submitLabel: string }) {
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
        {frequencyLabel && <> (current {frequencyLabel} rate)</>}. The rate in effect when you select {submitLabel} is
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

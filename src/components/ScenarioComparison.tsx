import {
  formatCents,
  formatDollars,
  formatIsoDate,
  formatPercent,
  formatSignedCents,
  formatYears,
} from "@/lib/format";
import { FREQUENCY_LABELS, PAYOUT_TYPE_LABELS, type PayoutSchedule } from "@/lib/payout";
import { differenceInCents, scheduleMetrics, type ScenarioSet } from "@/lib/scenarios";

function SelectionBadge() {
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-blue-900 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
      Your selection
    </span>
  );
}

function differenceClass(cents: number): string {
  if (cents > 0) return "text-emerald-700";
  if (cents < 0) return "text-red-700";
  return "text-slate-600";
}

function LongerPeriods({ scenarios }: { scenarios: ScenarioSet }) {
  const { selected, longerFrequencies } = scenarios;
  const inputs = selected.inputs;
  const all = [selected, ...longerFrequencies];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="p-5 pb-3">
        <h3 className="text-base font-semibold text-slate-900">Longer payout periods</h3>
        <p className="mt-1 text-sm text-slate-600">
          Same payout type ({PAYOUT_TYPE_LABELS[inputs.payoutType]}), paid less often. Each longer
          period uses its standard rate.
        </p>
      </div>
      {longerFrequencies.length === 0 ? (
        <p className="mx-5 mb-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          You selected {FREQUENCY_LABELS[inputs.frequency]} payouts, the longest payout period
          available, so there is no longer-period scenario to compare.
        </p>
      ) : (
        <div
          className="relative overflow-x-auto rounded-b-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          tabIndex={0}
          role="region"
          aria-label="Longer payout period comparison, scrolls horizontally"
        >
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <caption className="sr-only">
              Totals for your selection and for longer payout periods, in US dollars
            </caption>
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <th scope="col" className="px-4 py-3 text-left font-semibold">
                  Payout frequency
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Annual rate
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Payouts
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  First payout
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Final payout
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Total interest
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Total paid
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  vs your selection
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums text-slate-800">
              {all.map((schedule) => {
                const isSelected = schedule === selected;
                const m = scheduleMetrics(schedule);
                const diff = differenceInCents(schedule, selected);
                return (
                  <tr
                    key={schedule.inputs.frequency}
                    className={`border-b border-slate-100 ${isSelected ? "bg-blue-50/70" : ""}`}
                  >
                    <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-900">
                      {FREQUENCY_LABELS[schedule.inputs.frequency]}
                      {isSelected && <SelectionBadge />}
                    </th>
                    <td className="px-4 py-3 text-right">{formatPercent(schedule.inputs.annualRatePercent)}</td>
                    <td className="px-4 py-3 text-right">{m.payouts}</td>
                    <td className="px-4 py-3 text-right">{formatCents(m.firstPayoutCents)}</td>
                    <td className="px-4 py-3 text-right">{formatCents(m.finalPayoutCents)}</td>
                    <td className="px-4 py-3 text-right">{formatCents(m.totalInterestCents)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {formatCents(m.totalPaidCents)}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${isSelected ? "text-slate-400" : differenceClass(diff)}`}>
                      {isSelected ? (
                        <>
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">Not applicable</span>
                        </>
                      ) : (
                        formatSignedCents(diff)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function principalReturnText(schedule: PayoutSchedule): string {
  if (schedule.rows.length === 1) return "At maturity, in one payout";
  return schedule.inputs.payoutType === "interest-only"
    ? "All at maturity"
    : `In ${schedule.rows.length} equal installments`;
}

function PayoutTypeCard({ schedule, isSelected }: { schedule: PayoutSchedule; isSelected: boolean }) {
  const m = scheduleMetrics(schedule);
  const items = [
    { label: "Total interest", value: formatCents(m.totalInterestCents) },
    { label: "Total amount paid", value: formatCents(m.totalPaidCents), strong: true },
    { label: "First payout", value: formatCents(m.firstPayoutCents) },
    { label: "Final payout", value: formatCents(m.finalPayoutCents) },
    { label: "Principal returned", value: principalReturnText(schedule) },
  ];
  return (
    <div
      className={`rounded-xl border p-4 ${
        isSelected ? "border-blue-800 bg-blue-50/60 ring-1 ring-blue-800" : "border-slate-200 bg-white"
      }`}
    >
      <h4 className="flex flex-wrap items-center gap-y-1 text-base font-semibold text-slate-900">
        {PAYOUT_TYPE_LABELS[schedule.inputs.payoutType]}
        {isSelected && <SelectionBadge />}
      </h4>
      <dl className="mt-3 space-y-2 text-sm">
        {items.map((item) => (
          <div key={item.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-slate-600">{item.label}</dt>
            <dd className={`text-right tabular-nums ${item.strong ? "font-semibold text-slate-900" : "text-slate-800"}`}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PayoutTypes({ scenarios }: { scenarios: ScenarioSet }) {
  const { selected, otherPayoutType } = scenarios;
  const inputs = selected.inputs;
  const [interestOnly, amortizing] =
    inputs.payoutType === "interest-only" ? [selected, otherPayoutType] : [otherPayoutType, selected];
  const extraInterest = interestOnly.totals.interestCents - amortizing.totals.interestCents;

  let insight: string;
  if (extraInterest > 0) {
    insight = `Interest Only pays ${formatCents(extraInterest)} more interest over ${formatYears(
      inputs.lockInYears,
    ).toLowerCase()}, because the full principal stays invested until maturity. Interest and Principal returns your principal sooner, so its payouts shrink as the balance falls.`;
  } else if (selected.rows.length === 1) {
    insight = "With a single payout, both payout types pay the same amount on the same date.";
  } else {
    insight = "Both payout types pay the same total interest here, so the difference is only in when the principal comes back.";
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Interest Only vs Interest and Principal</h3>
      <p className="mt-1 text-sm text-slate-600">
        Same payout frequency ({FREQUENCY_LABELS[inputs.frequency]}) and rate (
        {formatPercent(inputs.annualRatePercent)}).
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <PayoutTypeCard schedule={interestOnly} isSelected={interestOnly === selected} />
        <PayoutTypeCard schedule={amortizing} isSelected={amortizing === selected} />
      </div>
      <p className="mt-4 text-sm text-slate-700">{insight}</p>

      <details className="group mt-4 rounded-xl border border-slate-200">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-blue-900 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 [&::-webkit-details-marker]:hidden">
          Compare payout by payout
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5 transition group-open:rotate-180"
          >
            <path
              fillRule="evenodd"
              d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </summary>
        <div
          className="relative overflow-x-auto border-t border-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          tabIndex={0}
          role="region"
          aria-label="Payout by payout comparison, scrolls horizontally"
        >
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <caption className="sr-only">
              Each payout under Interest Only and Interest and Principal, in US dollars
            </caption>
            <thead>
              <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <th scope="col" className="px-4 py-3 text-left font-semibold">
                  Payout No.
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold">
                  Payout Date
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Interest Only
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Interest and Principal
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Difference
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums text-slate-800">
              {interestOnly.rows.map((io, i) => {
                const ip = amortizing.rows[i];
                const diff = ip.totalPayoutCents - io.totalPayoutCents;
                return (
                  <tr key={io.payoutNumber} className="border-t border-slate-100">
                    <th scope="row" className="px-4 py-2.5 text-left font-medium text-slate-900">
                      {io.payoutNumber}
                    </th>
                    <td className="whitespace-nowrap px-4 py-2.5">{formatIsoDate(io.payoutDate)}</td>
                    <td className="px-4 py-2.5 text-right">{formatCents(io.totalPayoutCents)}</td>
                    <td className="px-4 py-2.5 text-right">{formatCents(ip.totalPayoutCents)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{formatSignedCents(diff)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="tabular-nums">
              <tr className="border-t-2 border-blue-900 bg-blue-50 font-semibold text-blue-950">
                <th scope="row" colSpan={2} className="px-4 py-3 text-left">
                  Total
                </th>
                <td className="px-4 py-3 text-right">{formatCents(interestOnly.totals.payoutCents)}</td>
                <td className="px-4 py-3 text-right">{formatCents(amortizing.totals.payoutCents)}</td>
                <td className="px-4 py-3 text-right">
                  {formatSignedCents(amortizing.totals.payoutCents - interestOnly.totals.payoutCents)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          Difference is the Interest and Principal payout minus the Interest Only payout.
        </p>
      </details>
    </div>
  );
}

export function ScenarioComparison({ scenarios }: { scenarios: ScenarioSet }) {
  const inputs = scenarios.selected.inputs;
  return (
    <section aria-labelledby="compare-heading" className="space-y-4 pt-2">
      <div>
        <h2 id="compare-heading" className="text-xl font-semibold text-slate-900">
          Compare scenarios
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          The same {formatDollars(inputs.principal)} investment for{" "}
          {formatYears(inputs.lockInYears).toLowerCase()}, with a longer payout period or the other
          payout type. The Excel download includes each scenario as its own sheet.
        </p>
      </div>
      <LongerPeriods scenarios={scenarios} />
      <PayoutTypes scenarios={scenarios} />
    </section>
  );
}

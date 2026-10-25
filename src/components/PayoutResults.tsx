"use client";

import { useState, type Ref } from "react";
import { DISCLAIMER } from "@/lib/disclaimer";
import { formatCents, formatDollars, formatIsoDate, formatPercent, formatYears } from "@/lib/format";
import { FREQUENCY_LABELS, PAYOUT_TYPE_LABELS } from "@/lib/payout";
import { usesStandardRate, type ScenarioSet } from "@/lib/scenarios";
import { ScenarioComparison } from "./ScenarioComparison";

const MONTHS_LABEL: Record<number, string> = { 4: "3 months", 2: "6 months", 1: "12 months" };

async function downloadExcel(scenarios: ScenarioSet) {
  // Loaded on demand so the spreadsheet library is not part of the page load.
  const { buildExcelFile, XLSX_MIME_TYPE } = await import("@/lib/excel");
  const { data, fileName } = await buildExcelFile(scenarios);
  const url = URL.createObjectURL(new Blob([data], { type: XLSX_MIME_TYPE }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sheetCountText(scenarios: ScenarioSet): string {
  const sheets = 2 + scenarios.longerFrequencies.length + 1;
  return `${sheets} sheets: your schedule, ${
    scenarios.longerFrequencies.length > 0
      ? `${scenarios.longerFrequencies.map((s) => FREQUENCY_LABELS[s.inputs.frequency]).join(" and ")} payouts, `
      : ""
  }${PAYOUT_TYPE_LABELS[scenarios.otherPayoutType.inputs.payoutType]}, and a comparison.`;
}

interface Props {
  scenarios: ScenarioSet;
  isStale: boolean;
  ref?: Ref<HTMLElement>;
}

export function PayoutResults({ scenarios, isStale, ref }: Props) {
  const schedule = scenarios.selected;
  const { inputs, rows, totals, periodsPerYear } = schedule;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadExcel(scenarios);
    } catch {
      setDownloadError("The Excel file could not be created. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  const details = [
    { label: "Original investment", value: formatDollars(inputs.principal) },
    {
      label: "Annual interest rate",
      value: formatPercent(inputs.annualRatePercent),
      note: usesStandardRate(schedule) ? `Standard ${FREQUENCY_LABELS[inputs.frequency]} rate` : "Custom rate",
    },
    { label: "Lock-in period", value: formatYears(inputs.lockInYears) },
    { label: "Payout type", value: PAYOUT_TYPE_LABELS[inputs.payoutType] },
    { label: "Payout frequency", value: FREQUENCY_LABELS[inputs.frequency] },
  ];

  const headline = [
    { label: "Total interest payable", value: formatCents(totals.interestCents) },
    { label: "Total principal returned", value: formatCents(totals.principalCents) },
    { label: "Total amount paid", value: formatCents(totals.payoutCents), primary: true },
  ];

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby="results-heading"
      className="scroll-mt-6 space-y-6 focus:outline-none"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="results-heading" className="text-xl font-semibold text-slate-900 sm:text-2xl">
            Your payout schedule
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {rows.length} {rows.length === 1 ? "payout" : "payouts"} starting from{" "}
            {formatIsoDate(inputs.startDate)}.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            aria-describedby="excel-download-note"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-900 bg-white px-4 py-2.5 text-sm font-semibold text-blue-900 shadow-sm transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
              <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
            </svg>
            {downloading ? "Preparing Excel…" : "Download Excel"}
          </button>
          <p id="excel-download-note" className="max-w-xs text-xs text-slate-500 sm:text-right">
            {sheetCountText(scenarios)}
          </p>
          {downloadError && (
            <p role="alert" className="text-xs font-medium text-red-700">
              {downloadError}
            </p>
          )}
        </div>
      </div>

      {isStale && (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          You have changed the inputs since this schedule was calculated. Select{" "}
          <span className="font-semibold">Calculate Payout</span> to update it.
        </div>
      )}

      {/* Summary */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
          {headline.map((item) => (
            <div
              key={item.label}
              className={item.primary ? "bg-blue-900 p-5 text-white" : "bg-white p-5"}
            >
              <p className={`text-sm ${item.primary ? "text-blue-100" : "text-slate-600"}`}>
                {item.label}
              </p>
              <p
                className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${
                  item.primary ? "text-white" : "text-slate-900"
                }`}
              >
                {item.value}
              </p>
            </div>
          ))}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-slate-200 p-5 sm:grid-cols-3 lg:grid-cols-5">
          {details.map((item) => (
            <div key={item.label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</dt>
              <dd className="mt-1 text-base font-semibold text-slate-900">
                {item.value}
                {item.note && (
                  <span className="mt-0.5 block text-xs font-normal text-slate-500">{item.note}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Schedule table */}
      <p className="-mb-3 text-xs text-slate-500 md:hidden">Swipe the table sideways to see every column.</p>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div
          className="overflow-x-auto rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          tabIndex={0}
          role="region"
          aria-label="Payout schedule table, scrolls horizontally"
        >
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <caption className="sr-only">
              Payout schedule for a {formatDollars(inputs.principal)} investment at{" "}
              {formatPercent(inputs.annualRatePercent)}, all amounts in US dollars
            </caption>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <th scope="col" className="px-4 py-3 text-left font-semibold">
                  Payout No.
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold">
                  Payout Date
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Opening Principal
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Interest Amount
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Principal Repayment
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Total Payout
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Remaining Principal
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums text-slate-800">
              {rows.map((row) => (
                <tr key={row.payoutNumber} className="border-b border-slate-100 even:bg-slate-50/60">
                  <th scope="row" className="px-4 py-3 text-left font-medium text-slate-900">
                    {row.payoutNumber}
                  </th>
                  <td className="whitespace-nowrap px-4 py-3">{formatIsoDate(row.payoutDate)}</td>
                  <td className="px-4 py-3 text-right">{formatCents(row.openingPrincipalCents)}</td>
                  <td className="px-4 py-3 text-right">{formatCents(row.interestCents)}</td>
                  <td className="px-4 py-3 text-right">{formatCents(row.principalRepaymentCents)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatCents(row.totalPayoutCents)}
                  </td>
                  <td className="px-4 py-3 text-right">{formatCents(row.remainingPrincipalCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="tabular-nums">
              <tr className="border-t-2 border-blue-900 bg-blue-50 font-semibold text-blue-950">
                <th scope="row" colSpan={3} className="px-4 py-3 text-left">
                  Total
                </th>
                <td className="px-4 py-3 text-right">{formatCents(totals.interestCents)}</td>
                <td className="px-4 py-3 text-right">{formatCents(totals.principalCents)}</td>
                <td className="px-4 py-3 text-right">{formatCents(totals.payoutCents)}</td>
                <td className="px-4 py-3 text-right">
                  {formatCents(rows.at(-1)?.remainingPrincipalCents ?? 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <ScenarioComparison scenarios={scenarios} />

      <div className="space-y-3 text-sm text-slate-600">
        <p>
          <span className="font-semibold text-slate-700">How dates are set:</span> the schedule starts
          on the date you submitted the form, {formatIsoDate(inputs.startDate)}. Each payout falls{" "}
          {MONTHS_LABEL[periodsPerYear]} after the previous one. When that day does not exist in a
          month, the payout falls on the last day of that month.
        </p>
        <p>
          <span className="font-semibold text-slate-700">How amounts are calculated:</span> simple
          interest, never compounded. Interest for each period is the annual rate times the principal
          outstanding before that payout, divided by {periodsPerYear}. Amounts are rounded to the cent,
          and the final payout absorbs any rounding difference so the totals reconcile.
        </p>
      </div>

      <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
        <span className="font-semibold text-slate-700">Disclaimer:</span> {DISCLAIMER}
      </p>
    </section>
  );
}

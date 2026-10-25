import { centsToDecimalString } from "./format";
import { FREQUENCY_LABELS, PAYOUT_TYPE_LABELS, type PayoutSchedule } from "./payout";

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function line(values: (string | number)[]): string {
  return values.map(escapeCsv).join(",");
}

export const CSV_HEADERS = [
  "Payout Number",
  "Payout Date",
  "Opening Principal (USD)",
  "Interest Amount (USD)",
  "Principal Repayment (USD)",
  "Total Payout (USD)",
  "Remaining Principal (USD)",
];

/** Builds a CSV export: a short summary block, then the schedule and a totals row. */
export function scheduleToCsv(schedule: PayoutSchedule): string {
  const { inputs, rows, totals } = schedule;
  const lines = [
    line(["Investment Payout Schedule"]),
    line(["Original Investment (USD)", centsToDecimalString(inputs.principal * 100)]),
    line(["Annual Interest Rate (%)", inputs.annualRatePercent]),
    line(["Lock-in Period (Years)", inputs.lockInYears]),
    line(["Payout Type", PAYOUT_TYPE_LABELS[inputs.payoutType]]),
    line(["Payout Frequency", FREQUENCY_LABELS[inputs.frequency]]),
    line(["Schedule Start Date", inputs.startDate]),
    "",
    line(CSV_HEADERS),
    ...rows.map((row) =>
      line([
        row.payoutNumber,
        row.payoutDate,
        centsToDecimalString(row.openingPrincipalCents),
        centsToDecimalString(row.interestCents),
        centsToDecimalString(row.principalRepaymentCents),
        centsToDecimalString(row.totalPayoutCents),
        centsToDecimalString(row.remainingPrincipalCents),
      ]),
    ),
    line([
      "Total",
      "",
      "",
      centsToDecimalString(totals.interestCents),
      centsToDecimalString(totals.principalCents),
      centsToDecimalString(totals.payoutCents),
      "",
    ]),
  ];
  return lines.join("\r\n") + "\r\n";
}

export function csvFileName(schedule: PayoutSchedule): string {
  const { inputs } = schedule;
  return `payout-schedule-${inputs.principal}-${inputs.lockInYears}y-${inputs.payoutType}-${inputs.frequency}.csv`;
}

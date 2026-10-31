/**
 * Excel (.xlsx) export of the payout schedule and its comparison scenarios.
 *
 * Workbook layout:
 *   1. "Your Selection"        - the schedule the visitor calculated
 *   2. "<Frequency> Payout"    - one sheet per longer payout period (if any)
 *   3. "<Other payout type>"   - the same schedule with the other payout type
 *   4. "Comparison"            - side-by-side totals for every scenario
 *
 * Investment statements (buildStatementFile) are a separate workbook: the
 * schedule of a recorded investment with each payout's status and payment,
 * and a list of the payments received.
 *
 * Amounts are written as real numbers with currency formatting, dates as real
 * Excel dates, and totals rows as SUM formulas (with cached results).
 */
import * as ExcelJSModule from "exceljs";
import type { Cell, Row, Workbook, Worksheet } from "exceljs";
import { formatDollars, formatIsoDate, formatPercent, formatYears } from "./format";
import {
  FREQUENCY_LABELS,
  interestStartDelayText,
  PAYOUT_TYPE_LABELS,
  type PayoutRow,
  type PayoutType,
} from "./payout";
import {
  differenceInCents,
  scheduleMetrics,
  type PublicSchedule,
  type PublicScenarioSet,
} from "./scenarios";
import { DISCLAIMER } from "./disclaimer";
import { statementFileName, type StatementData, type StatementRow } from "./statement";

// ExcelJS is CommonJS: depending on the bundler the classes live on the
// namespace itself or on its `default` export.
const ExcelJS =
  (ExcelJSModule as unknown as { default?: typeof ExcelJSModule }).default ?? ExcelJSModule;

export const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const NAVY = "FF1E3A8A";
const NAVY_TEXT = "FF172554";
const LIGHT_BLUE = "FFEFF6FF";
const SELECTED_FILL = "FFDBEAFE";
const BORDER_GRAY = "FFCBD5E1";
const MUTED_TEXT = "FF475569";

const CURRENCY = '"$"#,##0.00';
const SIGNED_CURRENCY = '+"$"#,##0.00;-"$"#,##0.00;"$"0.00';
const DATE = "mmm d, yyyy";

export const SELECTION_SHEET_NAME = "Your Selection";
export const COMPARISON_SHEET_NAME = "Comparison";

const PAYOUT_TYPE_SHEET_NAMES: Record<PayoutType, string> = {
  "interest-only": "Earnings Only",
  "interest-and-principal": "Earnings & Principal",
};

export interface ScheduleSheetSpec {
  name: string;
  schedule: PublicSchedule;
  /** One-line description shown under the sheet title. */
  subtitle: string;
}

/** Decides which schedule sheets the workbook contains, in order. */
export function planScheduleSheets(set: PublicScenarioSet): ScheduleSheetSpec[] {
  const selected = set.selected.inputs;
  const selectedFrequency = FREQUENCY_LABELS[selected.frequency];
  const selectedType = PAYOUT_TYPE_LABELS[selected.payoutType];
  const other = set.otherPayoutType.inputs;

  return [
    {
      name: SELECTION_SHEET_NAME,
      schedule: set.selected,
      subtitle: `Your selection: ${selectedFrequency} payouts, ${selectedType}`,
    },
    ...set.longerFrequencies.map((schedule) => {
      const frequency = FREQUENCY_LABELS[schedule.inputs.frequency];
      return {
        name: `${frequency} Payout`,
        schedule,
        subtitle: `Scenario: ${frequency} payouts instead of ${selectedFrequency}, ${selectedType}`,
      };
    }),
    {
      name: PAYOUT_TYPE_SHEET_NAMES[other.payoutType],
      schedule: set.otherPayoutType,
      subtitle: `Scenario: ${PAYOUT_TYPE_LABELS[other.payoutType]} instead of ${selectedType}, ${selectedFrequency} payouts`,
    },
  ];
}

export function excelFileName(schedule: PublicSchedule): string {
  const { inputs } = schedule;
  return `payout-schedule-${inputs.principal}-${inputs.lockInYears}y-${inputs.payoutType}-${inputs.frequency}.xlsx`;
}

const dollars = (cents: number) => cents / 100;

function isoToExcelDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function columnLetter(index: number): string {
  // 1-based, enough for the handful of columns used here.
  return String.fromCharCode(64 + index);
}

function styleTitle(row: Row) {
  row.getCell(1).font = { bold: true, size: 14, color: { argb: NAVY_TEXT } };
  row.height = 22;
}

function styleSubtitle(row: Row) {
  row.getCell(1).font = { italic: true, color: { argb: MUTED_TEXT } };
}

function styleSectionHeading(row: Row) {
  row.getCell(1).font = { bold: true, size: 12, color: { argb: NAVY_TEXT } };
  row.height = 20;
}

function styleHeader(row: Row, columns: number) {
  row.height = 32;
  for (let c = 1; c <= columns; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: c <= 1 ? "left" : "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: NAVY } } };
  }
}

function styleBodyRow(row: Row, columns: number, fill?: string) {
  for (let c = 1; c <= columns; c++) {
    const cell = row.getCell(c);
    cell.border = { bottom: { style: "hair", color: { argb: BORDER_GRAY } } };
    if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  }
}

function styleTotalsRow(row: Row, columns: number) {
  for (let c = 1; c <= columns; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: NAVY_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BLUE } };
    cell.border = {
      top: { style: "medium", color: { argb: NAVY } },
      bottom: { style: "thin", color: { argb: NAVY } },
    };
  }
}

function setFormat(cell: Cell, numFmt: string) {
  cell.numFmt = numFmt;
  cell.alignment = { horizontal: "right" };
}

/** Adds a label/value line to a details block. */
function addDetail(ws: Worksheet, label: string, value: string | number | Date, numFmt?: string) {
  const row = ws.addRow([label, value]);
  row.getCell(1).font = { bold: true, color: { argb: MUTED_TEXT } };
  const valueCell = row.getCell(2);
  if (numFmt) valueCell.numFmt = numFmt;
  valueCell.alignment = { horizontal: "left" };
  return row;
}

const LINE_HEIGHT_PT = 15;

/**
 * Row height (points) that fits `text` wrapped across merged columns whose
 * widths add up to `totalWidth` Excel width units. Excel does not auto-size
 * merged cells, so the height is estimated generously: about one character
 * per width unit per line.
 */
export function paragraphHeight(text: string, totalWidth: number): number {
  const charsPerLine = Math.max(20, Math.floor(totalWidth));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  return lines * LINE_HEIGHT_PT + 4;
}

/** Adds a wrapped paragraph spanning `columns` columns, tall enough to show all of it. */
function addParagraph(ws: Worksheet, text: string, columns: number, bold?: string) {
  const content = bold ? `${bold} ${text}` : text;
  const row = ws.addRow([content]);
  ws.mergeCells(row.number, 1, row.number, columns);
  const cell = row.getCell(1);
  cell.alignment = { wrapText: true, vertical: "top" };
  cell.font = { color: { argb: MUTED_TEXT } };
  let totalWidth = 0;
  for (let c = 1; c <= columns; c++) totalWidth += ws.getColumn(c).width ?? 9;
  row.height = paragraphHeight(content, totalWidth);
  return row;
}

function datesNote(schedule: PublicSchedule): string {
  const months = 12 / schedule.periodsPerYear;
  return `Payout dates: earnings start ${interestStartDelayText()} after the planned investment date, counting Monday to Friday as business days (public holidays are not taken into account). Payouts then fall every ${months} months, counted from the earnings start date. When that day does not exist in a month, the payout falls on the last day of that month. Payout dates are not moved for weekends.`;
}

const SCHEDULE_HEADERS = [
  "Payout No.",
  "Payout Date",
  "Opening Principal",
  "Earnings Amount",
  "Principal Repayment",
  "Total Payout",
  "Remaining Principal",
];

function writeScheduleSheet(workbook: Workbook, spec: ScheduleSheetSpec) {
  const { schedule } = spec;
  const { inputs, rows, totals } = schedule;
  const columns = SCHEDULE_HEADERS.length;
  const ws = workbook.addWorksheet(spec.name, {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [
    { width: 26 },
    { width: 16 },
    { width: 20 },
    { width: 18 },
    { width: 21 },
    { width: 18 },
    { width: 21 },
  ];

  styleTitle(ws.addRow(["Investment Payout Schedule"]));
  styleSubtitle(ws.addRow([spec.subtitle]));
  ws.addRow([]);

  addDetail(ws, "Original investment", inputs.principal, CURRENCY);
  addDetail(ws, "Term locked", formatYears(inputs.lockInYears));
  addDetail(ws, "Payout type", PAYOUT_TYPE_LABELS[inputs.payoutType]);
  addDetail(ws, "Payout term", FREQUENCY_LABELS[inputs.frequency]);
  addDetail(ws, "Planned investment date", isoToExcelDate(inputs.investmentDate), DATE);
  addDetail(ws, "Earnings start date", isoToExcelDate(schedule.startDate), DATE);
  addDetail(ws, "Total earnings payable", dollars(totals.interestCents), CURRENCY);
  addDetail(ws, "Total principal returned", dollars(totals.principalCents), CURRENCY);
  addDetail(ws, "Total amount paid", dollars(totals.payoutCents), CURRENCY).font = { bold: true };
  ws.addRow([]);

  styleHeader(ws.addRow(SCHEDULE_HEADERS), columns);
  const firstDataRow = ws.rowCount + 1;
  rows.forEach((r: PayoutRow, i) => {
    const row = ws.addRow([
      r.payoutNumber,
      isoToExcelDate(r.payoutDate),
      dollars(r.openingPrincipalCents),
      dollars(r.interestCents),
      dollars(r.principalRepaymentCents),
      dollars(r.totalPayoutCents),
      dollars(r.remainingPrincipalCents),
    ]);
    row.getCell(1).alignment = { horizontal: "left" };
    setFormat(row.getCell(2), DATE);
    for (let c = 3; c <= columns; c++) setFormat(row.getCell(c), CURRENCY);
    styleBodyRow(row, columns, i % 2 === 1 ? "FFF8FAFC" : undefined);
  });
  const lastDataRow = ws.rowCount;

  const sum = (column: number, resultCents: number) => ({
    formula: `SUM(${columnLetter(column)}${firstDataRow}:${columnLetter(column)}${lastDataRow})`,
    result: dollars(resultCents),
  });
  const totalsRow = ws.addRow([
    "Total",
    null,
    null,
    sum(4, totals.interestCents),
    sum(5, totals.principalCents),
    sum(6, totals.payoutCents),
    dollars(rows[rows.length - 1].remainingPrincipalCents),
  ]);
  styleTotalsRow(totalsRow, columns);
  for (let c = 4; c <= columns; c++) setFormat(totalsRow.getCell(c), CURRENCY);

  ws.addRow([]);
  addParagraph(ws, datesNote(schedule), columns);
  addParagraph(
    ws,
    "Amounts: simple earnings, never compounded. Earnings for each period are the annual rate for the payout term times the principal outstanding before that payout, divided by the number of payouts per year. Amounts are rounded to the cent, and the final payout absorbs any rounding difference.",
    columns,
  );
  addParagraph(ws, DISCLAIMER, columns, "Disclaimer:");
}

export const PAIR_DIFFERENCE_HEADER = "Earnings and Principal minus Earnings Only";

const COMPARISON_HEADERS = [
  "Scenario",
  "Payout Term",
  "Payout Type",
  "Number of Payouts",
  "First Payout",
  "Final Payout",
  "Total Earnings",
  "Total Paid",
  "Difference vs Your Selection",
];

function addComparisonRow(
  ws: Worksheet,
  label: string,
  schedule: PublicSchedule,
  baseline: PublicSchedule,
  isSelected: boolean,
) {
  const m = scheduleMetrics(schedule);
  const row = ws.addRow([
    label,
    FREQUENCY_LABELS[schedule.inputs.frequency],
    PAYOUT_TYPE_LABELS[schedule.inputs.payoutType],
    m.payouts,
    dollars(m.firstPayoutCents),
    dollars(m.finalPayoutCents),
    dollars(m.totalInterestCents),
    dollars(m.totalPaidCents),
    dollars(differenceInCents(schedule, baseline)),
  ]);
  row.getCell(4).alignment = { horizontal: "center" };
  for (let c = 5; c <= 8; c++) setFormat(row.getCell(c), CURRENCY);
  setFormat(row.getCell(9), SIGNED_CURRENCY);
  styleBodyRow(row, COMPARISON_HEADERS.length, isSelected ? SELECTED_FILL : undefined);
  if (isSelected) row.getCell(1).font = { bold: true, color: { argb: NAVY_TEXT } };
}

function writeComparisonSheet(workbook: Workbook, set: PublicScenarioSet) {
  const { selected } = set;
  const inputs = selected.inputs;
  const columns = COMPARISON_HEADERS.length;
  const selectedFrequency = FREQUENCY_LABELS[inputs.frequency];
  const selectedType = PAYOUT_TYPE_LABELS[inputs.payoutType];
  const ws = workbook.addWorksheet(COMPARISON_SHEET_NAME, {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [
    { width: 26 },
    { width: 17 },
    { width: 23 },
    { width: 12 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 18 },
  ];

  styleTitle(ws.addRow(["Payout Scenario Comparison"]));
  styleSubtitle(ws.addRow(["Every scenario uses the same investment amount, term and planned investment date as your selection."]));
  ws.addRow([]);
  addDetail(ws, "Original investment", inputs.principal, CURRENCY);
  addDetail(ws, "Term locked", formatYears(inputs.lockInYears));
  addDetail(ws, "Planned investment date", isoToExcelDate(inputs.investmentDate), DATE);
  addDetail(ws, "Earnings start date", isoToExcelDate(selected.startDate), DATE);
  addDetail(ws, "Your selection", `${selectedFrequency}, ${selectedType}`);
  ws.addRow([]);

  // Section 1: longer payout periods.
  styleSectionHeading(ws.addRow(["Longer payout terms"]));
  styleSubtitle(
    ws.addRow([
      `Same payout type (${selectedType}), paid less often. Each payout term has its own earnings rate.`,
    ]),
  );
  if (set.longerFrequencies.length === 0) {
    styleSubtitle(
      ws.addRow([
        `${selectedFrequency} is the longest payout term available, so there is no longer-term scenario.`,
      ]),
    );
  } else {
    styleHeader(ws.addRow(COMPARISON_HEADERS), columns);
    addComparisonRow(ws, "Your selection", selected, selected, true);
    for (const schedule of set.longerFrequencies) {
      addComparisonRow(ws, `${FREQUENCY_LABELS[schedule.inputs.frequency]} payout`, schedule, selected, false);
    }
  }
  ws.addRow([]);

  // Section 2: payout types.
  styleSectionHeading(ws.addRow(["Earnings Only vs Earnings and Principal"]));
  styleSubtitle(
    ws.addRow([
      `Same payout term (${selectedFrequency}) and earnings rate.`,
    ]),
  );
  styleHeader(ws.addRow(COMPARISON_HEADERS), columns);
  const byType: PublicSchedule[] = [selected, set.otherPayoutType].sort((a, b) =>
    a.inputs.payoutType === "interest-only" ? -1 : b.inputs.payoutType === "interest-only" ? 1 : 0,
  );
  for (const schedule of byType) {
    const isSelected = schedule === selected;
    addComparisonRow(ws, isSelected ? "Your selection" : "Other payout type", schedule, selected, isSelected);
  }
  ws.addRow([]);

  // Section 3: payout-by-payout for the two payout types.
  const interestOnly = byType[0];
  const amortizing = byType[1];
  styleSectionHeading(ws.addRow(["Payout by payout: Earnings Only vs Earnings and Principal"]));
  styleSubtitle(ws.addRow([`${selectedFrequency} payouts.`]));
  const pairHeader = ws.addRow([
    "Payout No.",
    "Payout Date",
    "Earnings Only Payout",
    "Earnings and Principal Payout",
    PAIR_DIFFERENCE_HEADER,
  ]);
  styleHeader(pairHeader, 5);
  pairHeader.height = 62;
  interestOnly.rows.forEach((io, i) => {
    const ip = amortizing.rows[i];
    const row = ws.addRow([
      io.payoutNumber,
      isoToExcelDate(io.payoutDate),
      dollars(io.totalPayoutCents),
      dollars(ip.totalPayoutCents),
      dollars(ip.totalPayoutCents - io.totalPayoutCents),
    ]);
    row.getCell(1).alignment = { horizontal: "left" };
    setFormat(row.getCell(2), DATE);
    setFormat(row.getCell(3), CURRENCY);
    setFormat(row.getCell(4), CURRENCY);
    setFormat(row.getCell(5), SIGNED_CURRENCY);
    styleBodyRow(row, 5);
  });
  const pairTotals = ws.addRow([
    "Total",
    null,
    dollars(interestOnly.totals.payoutCents),
    dollars(amortizing.totals.payoutCents),
    dollars(amortizing.totals.payoutCents - interestOnly.totals.payoutCents),
  ]);
  styleTotalsRow(pairTotals, 5);
  setFormat(pairTotals.getCell(3), CURRENCY);
  setFormat(pairTotals.getCell(4), CURRENCY);
  setFormat(pairTotals.getCell(5), SIGNED_CURRENCY);
  addParagraph(
    ws,
    "In this table, the last column is the Earnings and Principal payout minus the Earnings Only payout, whichever one you selected. Negative means Earnings and Principal pays less on that date.",
    columns,
  );
  ws.addRow([]);

  addParagraph(
    ws,
    "In the two tables above, Difference vs Your Selection is the scenario's total paid minus the total paid by your selection. Positive means the scenario pays more over the full term.",
    columns,
  );
  addParagraph(ws, DISCLAIMER, columns, "Disclaimer:");
}

/** Builds the workbook in memory. */
export function buildWorkbook(set: PublicScenarioSet): Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Investment Payout Calculator";
  workbook.title = "Investment Payout Schedule";
  for (const spec of planScheduleSheets(set)) writeScheduleSheet(workbook, spec);
  writeComparisonSheet(workbook, set);
  return workbook;
}

/** Builds the workbook and serializes it to .xlsx bytes. */
export async function buildExcelFile(set: PublicScenarioSet): Promise<{ data: ArrayBuffer; fileName: string }> {
  const buffer = await buildWorkbook(set).xlsx.writeBuffer();
  return { data: buffer as ArrayBuffer, fileName: excelFileName(set.selected) };
}

// ---------- investment statements ----------

const STATEMENT_STATUS_LABELS: Record<StatementRow["status"], string> = {
  paid: "Paid",
  due: "Due",
  upcoming: "Upcoming",
};

const PAID_FILL = "FFECFDF5";
const DUE_FILL = "FFFFFBEB";

function statementHeaders(data: StatementData): string[] {
  return [
    ...SCHEDULE_HEADERS,
    "Status",
    "Paid On",
    "Amount Paid",
    "Reference",
    ...(data.forAdmin ? ["Recorded By"] : []),
  ];
}

function writeStatementSheet(workbook: Workbook, data: StatementData) {
  const headers = statementHeaders(data);
  const columns = headers.length;
  const ws = workbook.addWorksheet("Statement", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [
    { width: 26 },
    { width: 16 },
    { width: 18 },
    { width: 16 },
    { width: 18 },
    { width: 16 },
    { width: 18 },
    { width: 11 },
    { width: 15 },
    { width: 15 },
    { width: 24 },
    ...(data.forAdmin ? [{ width: 22 }] : []),
  ];

  styleTitle(ws.addRow(["Investment Statement"]));
  styleSubtitle(ws.addRow([`Prepared for ${data.investorName} on ${formatIsoDate(data.preparedOn)}`]));
  ws.addRow([]);

  const paidCount = data.rows.filter((r) => r.status === "paid").length;
  addDetail(ws, "Investor", data.investorName);
  addDetail(ws, "Investment amount", data.principal, CURRENCY);
  addDetail(ws, "Planned investment date", isoToExcelDate(data.investmentDate), DATE);
  addDetail(ws, "Earnings start date", isoToExcelDate(data.startDate), DATE);
  addDetail(ws, "Maturity date", isoToExcelDate(data.maturityDate), DATE);
  addDetail(ws, "Term locked", formatYears(data.lockInYears));
  addDetail(ws, "Payout term", FREQUENCY_LABELS[data.frequency]);
  addDetail(ws, "Payout type", PAYOUT_TYPE_LABELS[data.payoutType]);
  if (data.forAdmin && data.annualRatePercent !== undefined) {
    addDetail(ws, "Annual rate (admins only)", formatPercent(data.annualRatePercent));
  }
  addDetail(ws, "Total earnings payable", dollars(data.totals.interestCents), CURRENCY);
  addDetail(ws, "Total amount scheduled", dollars(data.totals.payoutCents), CURRENCY);
  addDetail(ws, "Payouts paid", `${paidCount} of ${data.rows.length}`);
  addDetail(ws, "Total paid so far", dollars(data.paidCents), CURRENCY).font = { bold: true };
  ws.addRow([]);

  styleSectionHeading(ws.addRow(["Payout schedule and payments"]));
  styleHeader(ws.addRow(headers), columns);
  const firstDataRow = ws.rowCount + 1;
  for (const r of data.rows) {
    const row = ws.addRow([
      r.payoutNumber,
      isoToExcelDate(r.payoutDate),
      dollars(r.openingPrincipalCents),
      dollars(r.interestCents),
      dollars(r.principalRepaymentCents),
      dollars(r.totalPayoutCents),
      dollars(r.remainingPrincipalCents),
      STATEMENT_STATUS_LABELS[r.status],
      r.paidOn ? isoToExcelDate(r.paidOn) : null,
      r.paidCents === null ? null : dollars(r.paidCents),
      r.reference,
      ...(data.forAdmin ? [r.recordedBy ?? ""] : []),
    ]);
    row.getCell(1).alignment = { horizontal: "left" };
    setFormat(row.getCell(2), DATE);
    for (let c = 3; c <= 7; c++) setFormat(row.getCell(c), CURRENCY);
    setFormat(row.getCell(9), DATE);
    setFormat(row.getCell(10), CURRENCY);
    styleBodyRow(row, columns, r.status === "paid" ? PAID_FILL : r.status === "due" ? DUE_FILL : undefined);
  }
  const lastDataRow = ws.rowCount;
  const sum = (column: number, resultCents: number) => ({
    formula: `SUM(${columnLetter(column)}${firstDataRow}:${columnLetter(column)}${lastDataRow})`,
    result: dollars(resultCents),
  });
  const totalsRow = ws.addRow([
    "Total",
    null,
    null,
    sum(4, data.totals.interestCents),
    sum(5, data.totals.principalCents),
    sum(6, data.totals.payoutCents),
    dollars(data.rows[data.rows.length - 1].remainingPrincipalCents),
    null,
    null,
    sum(10, data.paidCents),
  ]);
  styleTotalsRow(totalsRow, columns);
  for (const c of [4, 5, 6, 7, 10]) setFormat(totalsRow.getCell(c), CURRENCY);

  ws.addRow([]);
  addParagraph(
    ws,
    "Status: Paid means the payment has been recorded, with the date it was paid. Due means the scheduled date has arrived and the payment has not been recorded yet. Upcoming means the scheduled date is still ahead. Dates are calendar dates; the status uses today's date in Eastern Time.",
    SCHEDULE_HEADERS.length,
  );
  addParagraph(
    ws,
    "Amounts: simple earnings, never compounded. Amounts are rounded to the cent, and the final payout absorbs any rounding difference. Payout dates are not moved for weekends.",
    SCHEDULE_HEADERS.length,
  );
  addParagraph(ws, DISCLAIMER, SCHEDULE_HEADERS.length, "Disclaimer:");
}

function writePaymentsSheet(workbook: Workbook, data: StatementData) {
  const headers = ["Payout No.", "Scheduled Date", "Scheduled Amount", "Paid On", "Amount Paid", "Reference"];
  if (data.forAdmin) headers.push("Recorded By");
  const columns = headers.length;
  const ws = workbook.addWorksheet("Payments", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [{ width: 14 }, { width: 16 }, { width: 18 }, { width: 15 }, { width: 15 }, { width: 28 }, { width: 22 }].slice(
    0,
    columns,
  );

  styleTitle(ws.addRow(["Payments Received"]));
  styleSubtitle(ws.addRow([`${formatDollars(data.principal)} investment of ${data.investorName}`]));
  ws.addRow([]);

  const paid = data.rows.filter((r) => r.paidOn !== null && r.paidCents !== null);
  if (paid.length === 0) {
    styleSubtitle(ws.addRow(["No payments have been recorded yet."]));
    return;
  }
  styleHeader(ws.addRow(headers), columns);
  const firstDataRow = ws.rowCount + 1;
  for (const r of paid) {
    const row = ws.addRow([
      r.payoutNumber,
      isoToExcelDate(r.payoutDate),
      dollars(r.totalPayoutCents),
      isoToExcelDate(r.paidOn!),
      dollars(r.paidCents!),
      r.reference,
      ...(data.forAdmin ? [r.recordedBy ?? ""] : []),
    ]);
    row.getCell(1).alignment = { horizontal: "left" };
    setFormat(row.getCell(2), DATE);
    setFormat(row.getCell(3), CURRENCY);
    setFormat(row.getCell(4), DATE);
    setFormat(row.getCell(5), CURRENCY);
    styleBodyRow(row, columns);
  }
  const lastDataRow = ws.rowCount;
  const totalsRow = ws.addRow([
    "Total",
    null,
    null,
    null,
    { formula: `SUM(E${firstDataRow}:E${lastDataRow})`, result: dollars(data.paidCents) },
  ]);
  styleTotalsRow(totalsRow, columns);
  setFormat(totalsRow.getCell(5), CURRENCY);
}

/** Builds an investment statement (schedule, statuses and recorded payments) as .xlsx bytes. */
export async function buildStatementFile(data: StatementData): Promise<{ data: ArrayBuffer; fileName: string }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Investment Payout Calculator";
  workbook.title = "Investment Statement";
  writeStatementSheet(workbook, data);
  writePaymentsSheet(workbook, data);
  const buffer = await workbook.xlsx.writeBuffer();
  return { data: buffer as ArrayBuffer, fileName: statementFileName(data) };
}

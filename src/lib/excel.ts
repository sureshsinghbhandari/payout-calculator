/**
 * Excel (.xlsx) export of the payout schedule and its comparison scenarios.
 *
 * Workbook layout:
 *   1. "Your Selection"        - the schedule the visitor calculated
 *   2. "<Frequency> Payout"    - one sheet per longer payout period (if any)
 *   3. "<Other payout type>"   - the same schedule with the other payout type
 *   4. "Comparison"            - side-by-side totals for every scenario
 *
 * Amounts are written as real numbers with currency formatting, dates as real
 * Excel dates, and totals rows as SUM formulas (with cached results).
 */
import * as ExcelJSModule from "exceljs";
import type { Cell, Row, Workbook, Worksheet } from "exceljs";
import { DEFAULT_RATE_BY_FREQUENCY } from "./config";
import { formatPercent, formatYears } from "./format";
import {
  FREQUENCY_LABELS,
  PAYOUT_TYPE_LABELS,
  type PayoutRow,
  type PayoutSchedule,
  type PayoutType,
} from "./payout";
import {
  differenceInCents,
  FREQUENCY_ORDER,
  scheduleMetrics,
  usesStandardRate,
  type ScenarioSet,
} from "./scenarios";
import { DISCLAIMER } from "./disclaimer";

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
const PERCENT = "0.00##%";
const DATE = "mmm d, yyyy";

export const SELECTION_SHEET_NAME = "Your Selection";
export const COMPARISON_SHEET_NAME = "Comparison";

const PAYOUT_TYPE_SHEET_NAMES: Record<PayoutType, string> = {
  "interest-only": "Interest Only",
  "interest-and-principal": "Interest & Principal",
};

export interface ScheduleSheetSpec {
  name: string;
  schedule: PayoutSchedule;
  /** One-line description shown under the sheet title. */
  subtitle: string;
  /** Where the rate comes from, e.g. "Standard Yearly rate". */
  rateBasis: string;
}

function selectionRateBasis(schedule: PayoutSchedule): string {
  return usesStandardRate(schedule)
    ? `Standard ${FREQUENCY_LABELS[schedule.inputs.frequency]} rate`
    : "Rate you entered";
}

/** Decides which schedule sheets the workbook contains, in order. */
export function planScheduleSheets(set: ScenarioSet): ScheduleSheetSpec[] {
  const selected = set.selected.inputs;
  const selectedFrequency = FREQUENCY_LABELS[selected.frequency];
  const selectedType = PAYOUT_TYPE_LABELS[selected.payoutType];
  const other = set.otherPayoutType.inputs;

  return [
    {
      name: SELECTION_SHEET_NAME,
      schedule: set.selected,
      subtitle: `Your selection: ${selectedFrequency} payouts, ${selectedType}`,
      rateBasis: selectionRateBasis(set.selected),
    },
    ...set.longerFrequencies.map((schedule) => {
      const frequency = FREQUENCY_LABELS[schedule.inputs.frequency];
      return {
        name: `${frequency} Payout`,
        schedule,
        subtitle: `Scenario: ${frequency} payouts instead of ${selectedFrequency}, ${selectedType}`,
        rateBasis: `Standard ${frequency} rate`,
      };
    }),
    {
      name: PAYOUT_TYPE_SHEET_NAMES[other.payoutType],
      schedule: set.otherPayoutType,
      subtitle: `Scenario: ${PAYOUT_TYPE_LABELS[other.payoutType]} instead of ${selectedType}, ${selectedFrequency} payouts`,
      rateBasis: "Same rate as your selection",
    },
  ];
}

export function excelFileName(schedule: PayoutSchedule): string {
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

/** Adds a wrapped paragraph spanning `columns` columns. */
function addParagraph(ws: Worksheet, text: string, columns: number, height: number, bold?: string) {
  const row = ws.addRow([bold ? `${bold} ${text}` : text]);
  ws.mergeCells(row.number, 1, row.number, columns);
  const cell = row.getCell(1);
  cell.alignment = { wrapText: true, vertical: "top" };
  cell.font = { color: { argb: MUTED_TEXT } };
  row.height = height;
  return row;
}

function datesNote(schedule: PayoutSchedule): string {
  const months = 12 / schedule.periodsPerYear;
  return `Payout dates: the schedule starts on the date the form was submitted. Each payout falls ${months} months after the previous one. When that day does not exist in a month, the payout falls on the last day of that month.`;
}

const SCHEDULE_HEADERS = [
  "Payout No.",
  "Payout Date",
  "Opening Principal",
  "Interest Amount",
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
  addDetail(ws, "Annual interest rate", inputs.annualRatePercent / 100, PERCENT);
  addDetail(ws, "Rate basis", spec.rateBasis);
  addDetail(ws, "Lock-in period", formatYears(inputs.lockInYears));
  addDetail(ws, "Payout type", PAYOUT_TYPE_LABELS[inputs.payoutType]);
  addDetail(ws, "Payout frequency", FREQUENCY_LABELS[inputs.frequency]);
  addDetail(ws, "Schedule start date", isoToExcelDate(inputs.startDate), DATE);
  addDetail(ws, "Total interest payable", dollars(totals.interestCents), CURRENCY);
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
  addParagraph(ws, datesNote(schedule), columns, 32);
  addParagraph(
    ws,
    "Amounts: simple interest, never compounded. Interest for each period is the annual rate times the principal outstanding before that payout, divided by the number of payouts per year. Amounts are rounded to the cent, and the final payout absorbs any rounding difference.",
    columns,
    46,
  );
  addParagraph(ws, DISCLAIMER, columns, 46, "Disclaimer:");
}

export const PAIR_DIFFERENCE_HEADER = "Interest and Principal minus Interest Only";

const COMPARISON_HEADERS = [
  "Scenario",
  "Payout Frequency",
  "Payout Type",
  "Annual Rate",
  "Number of Payouts",
  "First Payout",
  "Final Payout",
  "Total Interest",
  "Total Paid",
  "Difference vs Your Selection",
];

function addComparisonRow(
  ws: Worksheet,
  label: string,
  schedule: PayoutSchedule,
  baseline: PayoutSchedule,
  isSelected: boolean,
) {
  const m = scheduleMetrics(schedule);
  const row = ws.addRow([
    label,
    FREQUENCY_LABELS[schedule.inputs.frequency],
    PAYOUT_TYPE_LABELS[schedule.inputs.payoutType],
    schedule.inputs.annualRatePercent / 100,
    m.payouts,
    dollars(m.firstPayoutCents),
    dollars(m.finalPayoutCents),
    dollars(m.totalInterestCents),
    dollars(m.totalPaidCents),
    dollars(differenceInCents(schedule, baseline)),
  ]);
  setFormat(row.getCell(4), PERCENT);
  row.getCell(5).alignment = { horizontal: "center" };
  for (let c = 6; c <= 9; c++) setFormat(row.getCell(c), CURRENCY);
  setFormat(row.getCell(10), SIGNED_CURRENCY);
  styleBodyRow(row, COMPARISON_HEADERS.length, isSelected ? SELECTED_FILL : undefined);
  if (isSelected) row.getCell(1).font = { bold: true, color: { argb: NAVY_TEXT } };
}

function writeComparisonSheet(workbook: Workbook, set: ScenarioSet) {
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
    { width: 13 },
    { width: 12 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 18 },
  ];

  styleTitle(ws.addRow(["Payout Scenario Comparison"]));
  styleSubtitle(ws.addRow(["Every scenario uses the same investment, lock-in period and start date as your selection."]));
  ws.addRow([]);
  addDetail(ws, "Original investment", inputs.principal, CURRENCY);
  addDetail(ws, "Lock-in period", formatYears(inputs.lockInYears));
  addDetail(ws, "Schedule start date", isoToExcelDate(inputs.startDate), DATE);
  addDetail(
    ws,
    "Your selection",
    `${selectedFrequency}, ${selectedType}, ${formatPercent(inputs.annualRatePercent)}`,
  );
  addDetail(
    ws,
    "Standard rates",
    FREQUENCY_ORDER.map((f) => `${FREQUENCY_LABELS[f]} ${formatPercent(DEFAULT_RATE_BY_FREQUENCY[f])}`).join(", "),
  );
  ws.addRow([]);

  // Section 1: longer payout periods.
  styleSectionHeading(ws.addRow(["Longer payout periods"]));
  styleSubtitle(
    ws.addRow([
      `Same payout type (${selectedType}), paid less often. Each longer period uses its standard rate.`,
    ]),
  );
  if (set.longerFrequencies.length === 0) {
    styleSubtitle(
      ws.addRow([
        `${selectedFrequency} is the longest payout period available, so there is no longer-period scenario.`,
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
  styleSectionHeading(ws.addRow(["Interest Only vs Interest and Principal"]));
  styleSubtitle(
    ws.addRow([
      `Same payout frequency (${selectedFrequency}) and rate (${formatPercent(inputs.annualRatePercent)}).`,
    ]),
  );
  styleHeader(ws.addRow(COMPARISON_HEADERS), columns);
  const byType: PayoutSchedule[] = [selected, set.otherPayoutType].sort((a, b) =>
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
  styleSectionHeading(ws.addRow(["Payout by payout: Interest Only vs Interest and Principal"]));
  styleSubtitle(ws.addRow([`${selectedFrequency} payouts at ${formatPercent(inputs.annualRatePercent)}.`]));
  const pairHeader = ws.addRow([
    "Payout No.",
    "Payout Date",
    "Interest Only Payout",
    "Interest and Principal Payout",
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
    "In this table, the last column is the Interest and Principal payout minus the Interest Only payout, whichever one you selected. Negative means Interest and Principal pays less on that date.",
    columns,
    32,
  );
  ws.addRow([]);

  addParagraph(
    ws,
    "In the two tables above, Difference vs Your Selection is the scenario's total paid minus the total paid by your selection. Positive means the scenario pays more over the full term.",
    columns,
    32,
  );
  addParagraph(ws, DISCLAIMER, columns, 32, "Disclaimer:");
}

/** Builds the workbook in memory. */
export function buildWorkbook(set: ScenarioSet): Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Investment Payout Calculator";
  workbook.title = "Investment Payout Schedule";
  for (const spec of planScheduleSheets(set)) writeScheduleSheet(workbook, spec);
  writeComparisonSheet(workbook, set);
  return workbook;
}

/** Builds the workbook and serializes it to .xlsx bytes. */
export async function buildExcelFile(set: ScenarioSet): Promise<{ data: ArrayBuffer; fileName: string }> {
  const buffer = await buildWorkbook(set).xlsx.writeBuffer();
  return { data: buffer as ArrayBuffer, fileName: excelFileName(set.selected) };
}

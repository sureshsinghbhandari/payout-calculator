import * as ExcelJSModule from "exceljs";
import type { CellValue, Worksheet } from "exceljs";
import { describe, expect, it } from "vitest";
import {
  buildExcelFile,
  COMPARISON_SHEET_NAME,
  excelFileName,
  planScheduleSheets,
  SELECTION_SHEET_NAME,
} from "./excel";
import { calculatePayoutSchedule, type PayoutInputs } from "./payout";
import { buildScenarios } from "./scenarios";

const ExcelJS =
  (ExcelJSModule as unknown as { default?: typeof ExcelJSModule }).default ?? ExcelJSModule;

function scenariosFor(overrides: Partial<PayoutInputs>) {
  return buildScenarios(
    calculatePayoutSchedule({
      principal: 25_000,
      annualRatePercent: 8,
      lockInYears: 1,
      payoutType: "interest-only",
      frequency: "quarterly",
      startDate: "2026-01-15",
      ...overrides,
    }),
  );
}

async function roundTrip(overrides: Partial<PayoutInputs>) {
  const { data, fileName } = await buildExcelFile(scenariosFor(overrides));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  return { workbook, fileName, bytes: data.byteLength };
}

/** Values of a row, 1-based columns flattened to a 0-based array. */
function rowValues(ws: Worksheet, rowNumber: number): CellValue[] {
  const values = ws.getRow(rowNumber).values as CellValue[];
  return values.slice(1);
}

function findRow(ws: Worksheet, firstCell: string, after = 0): number {
  for (let r = after + 1; r <= ws.rowCount; r++) {
    if (ws.getRow(r).getCell(1).value === firstCell) return r;
  }
  throw new Error(`Row starting with "${firstCell}" not found in ${ws.name}`);
}

function detail(ws: Worksheet, label: string): CellValue {
  return ws.getRow(findRow(ws, label)).getCell(2).value;
}

function sheetText(ws: Worksheet): string {
  const parts: string[] = [];
  ws.eachRow((row) => row.eachCell((cell) => parts.push(String(cell.text))));
  return parts.join("\n");
}

describe("planScheduleSheets", () => {
  it("Quarterly: selection, Half-Yearly, Yearly, other payout type", () => {
    expect(planScheduleSheets(scenariosFor({ frequency: "quarterly" })).map((s) => s.name)).toEqual([
      "Your Selection",
      "Half-Yearly Payout",
      "Yearly Payout",
      "Interest & Principal",
    ]);
  });

  it("Half-Yearly: selection, Yearly, other payout type", () => {
    const set = scenariosFor({ frequency: "half-yearly", annualRatePercent: 9 });
    expect(planScheduleSheets(set).map((s) => s.name)).toEqual([
      "Your Selection",
      "Yearly Payout",
      "Interest & Principal",
    ]);
  });

  it("Yearly: selection and other payout type only", () => {
    const set = scenariosFor({ frequency: "yearly", annualRatePercent: 10, payoutType: "interest-and-principal" });
    expect(planScheduleSheets(set).map((s) => s.name)).toEqual(["Your Selection", "Interest Only"]);
  });

  it("describes where each rate comes from", () => {
    const standard = planScheduleSheets(scenariosFor({ annualRatePercent: 8 }));
    expect(standard.map((s) => s.rateBasis)).toEqual([
      "Standard Quarterly rate",
      "Standard Half-Yearly rate",
      "Standard Yearly rate",
      "Same rate as your selection",
    ]);
    expect(planScheduleSheets(scenariosFor({ annualRatePercent: 7 }))[0].rateBasis).toBe("Rate you entered");
  });

  it("produces valid Excel sheet names", () => {
    for (const frequency of ["quarterly", "half-yearly", "yearly"] as const) {
      for (const payoutType of ["interest-only", "interest-and-principal"] as const) {
        for (const spec of planScheduleSheets(scenariosFor({ frequency, payoutType }))) {
          expect(spec.name.length).toBeLessThanOrEqual(31);
          expect(spec.name).not.toMatch(/[\\/?*[\]:]/);
        }
      }
    }
  });
});

describe("Excel workbook", () => {
  it("names the file after the selection", () => {
    expect(excelFileName(scenariosFor({}).selected)).toBe(
      "payout-schedule-25000-1y-interest-only-quarterly.xlsx",
    );
  });

  it("contains the expected sheets for a Quarterly selection", async () => {
    const { workbook, bytes } = await roundTrip({ frequency: "quarterly" });
    expect(bytes).toBeGreaterThan(1000);
    expect(workbook.worksheets.map((ws) => ws.name)).toEqual([
      "Your Selection",
      "Half-Yearly Payout",
      "Yearly Payout",
      "Interest & Principal",
      "Comparison",
    ]);
  });

  it("contains one extra frequency sheet for a Half-Yearly selection", async () => {
    const { workbook } = await roundTrip({ frequency: "half-yearly", annualRatePercent: 9 });
    expect(workbook.worksheets.map((ws) => ws.name)).toEqual([
      "Your Selection",
      "Yearly Payout",
      "Interest & Principal",
      "Comparison",
    ]);
  });

  it("contains no extra frequency sheet for a Yearly selection", async () => {
    const { workbook } = await roundTrip({ frequency: "yearly", annualRatePercent: 10 });
    expect(workbook.worksheets.map((ws) => ws.name)).toEqual([
      "Your Selection",
      "Interest & Principal",
      "Comparison",
    ]);
    expect(sheetText(workbook.getWorksheet(COMPARISON_SHEET_NAME)!)).toContain(
      "Yearly is the longest payout period available",
    );
  });

  it("writes the selected schedule as real numbers, dates and formulas", async () => {
    const { workbook } = await roundTrip({});
    const ws = workbook.getWorksheet(SELECTION_SHEET_NAME)!;

    expect(detail(ws, "Original investment")).toBe(25_000);
    expect(detail(ws, "Annual interest rate")).toBe(0.08);
    expect(detail(ws, "Rate basis")).toBe("Standard Quarterly rate");
    expect(detail(ws, "Payout type")).toBe("Interest Only");
    expect(detail(ws, "Payout frequency")).toBe("Quarterly");
    expect(detail(ws, "Total interest payable")).toBe(2_000);
    expect(detail(ws, "Total amount paid")).toBe(27_000);
    expect((detail(ws, "Schedule start date") as Date).toISOString().slice(0, 10)).toBe("2026-01-15");

    const header = findRow(ws, "Payout No.");
    expect(rowValues(ws, header)).toEqual([
      "Payout No.",
      "Payout Date",
      "Opening Principal",
      "Interest Amount",
      "Principal Repayment",
      "Total Payout",
      "Remaining Principal",
    ]);
    const first = rowValues(ws, header + 1);
    expect(first[0]).toBe(1);
    expect((first[1] as Date).toISOString().slice(0, 10)).toBe("2026-04-15");
    expect(first.slice(2)).toEqual([25_000, 500, 0, 500, 25_000]);
    expect(rowValues(ws, header + 4).slice(2)).toEqual([25_000, 500, 25_000, 25_500, 0]);
    expect(ws.getRow(header + 2).getCell(3).numFmt).toBe('"$"#,##0.00');

    const totals = ws.getRow(header + 5);
    expect(totals.getCell(1).value).toBe("Total");
    expect(totals.getCell(4).value).toEqual({ formula: `SUM(D${header + 1}:D${header + 4})`, result: 2_000 });
    expect(totals.getCell(5).value).toEqual({ formula: `SUM(E${header + 1}:E${header + 4})`, result: 25_000 });
    expect(totals.getCell(6).value).toEqual({ formula: `SUM(F${header + 1}:F${header + 4})`, result: 27_000 });
    expect(totals.getCell(7).value).toBe(0);

    expect(sheetText(ws)).toContain("not a guarantee of investment performance");
  });

  it("writes longer-period sheets at their standard rates", async () => {
    const { workbook } = await roundTrip({});
    const half = workbook.getWorksheet("Half-Yearly Payout")!;
    expect(detail(half, "Annual interest rate")).toBe(0.09);
    expect(detail(half, "Payout frequency")).toBe("Half-Yearly");
    expect(detail(half, "Payout type")).toBe("Interest Only");
    // $25,000 x 9% / 2 = $1,125 per half-year.
    expect(detail(half, "Total interest payable")).toBe(2_250);
    const header = findRow(half, "Payout No.");
    expect(rowValues(half, header + 1).slice(2)).toEqual([25_000, 1_125, 0, 1_125, 25_000]);
    expect(rowValues(half, header + 2).slice(2)).toEqual([25_000, 1_125, 25_000, 26_125, 0]);

    const yearly = workbook.getWorksheet("Yearly Payout")!;
    expect(detail(yearly, "Annual interest rate")).toBe(0.1);
    expect(detail(yearly, "Total amount paid")).toBe(27_500);
  });

  it("writes the other payout type at the selected frequency and rate", async () => {
    const { workbook } = await roundTrip({});
    const ws = workbook.getWorksheet("Interest & Principal")!;
    expect(detail(ws, "Payout type")).toBe("Interest and Principal");
    expect(detail(ws, "Annual interest rate")).toBe(0.08);
    const header = findRow(ws, "Payout No.");
    expect([1, 2, 3, 4].map((i) => ws.getRow(header + i).getCell(4).value)).toEqual([500, 375, 250, 125]);
    expect(ws.getRow(header + 4).getCell(7).value).toBe(0);
  });

  it("writes a comparison sheet with differences against the selection", async () => {
    const { workbook } = await roundTrip({});
    const ws = workbook.getWorksheet(COMPARISON_SHEET_NAME)!;

    const longerHeader = findRow(ws, "Scenario");
    expect(rowValues(ws, longerHeader + 1)).toEqual([
      "Your selection", "Quarterly", "Interest Only", 0.08, 4, 500, 25_500, 2_000, 27_000, 0,
    ]);
    expect(rowValues(ws, longerHeader + 2)).toEqual([
      "Half-Yearly payout", "Half-Yearly", "Interest Only", 0.09, 2, 1_125, 26_125, 2_250, 27_250, 250,
    ]);
    expect(rowValues(ws, longerHeader + 3)).toEqual([
      "Yearly payout", "Yearly", "Interest Only", 0.1, 1, 27_500, 27_500, 2_500, 27_500, 500,
    ]);

    const typeHeader = findRow(ws, "Scenario", longerHeader);
    expect(rowValues(ws, typeHeader + 1)[0]).toBe("Your selection");
    expect(rowValues(ws, typeHeader + 1)[2]).toBe("Interest Only");
    expect(rowValues(ws, typeHeader + 2)).toEqual([
      "Other payout type", "Quarterly", "Interest and Principal", 0.08, 4, 6_750, 6_375, 1_250, 26_250, -750,
    ]);

    const pairHeader = findRow(ws, "Payout No.");
    expect(rowValues(ws, pairHeader + 1).slice(2)).toEqual([500, 6_750, 6_250]);
    expect(rowValues(ws, pairHeader + 4).slice(2)).toEqual([25_500, 6_375, -19_125]);
    expect(rowValues(ws, pairHeader + 5)[0]).toBe("Total");
    expect(rowValues(ws, pairHeader + 5).slice(2)).toEqual([27_000, 26_250, -750]);
  });

  it("lists Interest Only first in the payout type comparison even when it is not selected", async () => {
    const { workbook } = await roundTrip({ payoutType: "interest-and-principal" });
    const ws = workbook.getWorksheet(COMPARISON_SHEET_NAME)!;
    const typeHeader = findRow(ws, "Scenario", findRow(ws, "Scenario"));
    expect(rowValues(ws, typeHeader + 1).slice(0, 3)).toEqual(["Other payout type", "Quarterly", "Interest Only"]);
    expect(rowValues(ws, typeHeader + 1)[9]).toBe(750);
    expect(rowValues(ws, typeHeader + 2).slice(0, 3)).toEqual([
      "Your selection",
      "Quarterly",
      "Interest and Principal",
    ]);
  });
});

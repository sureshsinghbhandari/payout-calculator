import * as ExcelJSModule from "exceljs";
import type { CellValue, Workbook, Worksheet } from "exceljs";
import { describe, expect, it } from "vitest";
import {
  buildExcelFile,
  COMPARISON_SHEET_NAME,
  excelFileName,
  paragraphHeight,
  planScheduleSheets,
  SELECTION_SHEET_NAME,
} from "./excel";
import type { RateTable } from "./rates";
import { buildScenarios, toPublicScenarioSet, type QuoteInputs } from "./scenarios";

const ExcelJS =
  (ExcelJSModule as unknown as { default?: typeof ExcelJSModule }).default ?? ExcelJSModule;

const RATES: RateTable = { quarterly: 8, "half-yearly": 9, yearly: 10 };

function scenariosFor(overrides: Partial<QuoteInputs>, rates: RateTable = RATES) {
  return toPublicScenarioSet(
    buildScenarios(
      {
        principal: 25_000,
        lockInYears: 1,
        payoutType: "interest-only",
        frequency: "quarterly",
        investmentDate: "2026-01-14", // Wednesday -> earnings start Thursday Jan 15, 2026
        ...overrides,
      },
      rates,
    ),
  );
}

async function roundTrip(overrides: Partial<QuoteInputs>, rates: RateTable = RATES) {
  const { data, fileName } = await buildExcelFile(scenariosFor(overrides, rates));
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

function isoOf(value: CellValue): string {
  return (value as Date).toISOString().slice(0, 10);
}

function sheetText(ws: Worksheet): string {
  const parts: string[] = [];
  ws.eachRow((row) => row.eachCell((cell) => parts.push(String(cell.text))));
  return parts.join("\n");
}

function everyCell(workbook: Workbook, visit: (value: CellValue, numFmt: string, where: string) => void) {
  for (const ws of workbook.worksheets) {
    ws.eachRow((row) =>
      row.eachCell((cell) => visit(cell.value, cell.numFmt ?? "", `${ws.name}!${cell.address}`)),
    );
  }
}

describe("planScheduleSheets", () => {
  it("Quarterly: selection, Half-Yearly, Yearly, other payout type", () => {
    expect(planScheduleSheets(scenariosFor({ frequency: "quarterly" })).map((s) => s.name)).toEqual([
      "Your Selection",
      "Half-Yearly Payout",
      "Yearly Payout",
      "Earnings & Principal",
    ]);
  });

  it("Half-Yearly: selection, Yearly, other payout type", () => {
    expect(planScheduleSheets(scenariosFor({ frequency: "half-yearly" })).map((s) => s.name)).toEqual([
      "Your Selection",
      "Yearly Payout",
      "Earnings & Principal",
    ]);
  });

  it("Yearly: selection and other payout type only", () => {
    const set = scenariosFor({ frequency: "yearly", payoutType: "interest-and-principal" });
    expect(planScheduleSheets(set).map((s) => s.name)).toEqual(["Your Selection", "Earnings Only"]);
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
      "Earnings & Principal",
      "Comparison",
    ]);
  });

  it("contains one extra frequency sheet for a Half-Yearly selection", async () => {
    const { workbook } = await roundTrip({ frequency: "half-yearly" });
    expect(workbook.worksheets.map((ws) => ws.name)).toEqual([
      "Your Selection",
      "Yearly Payout",
      "Earnings & Principal",
      "Comparison",
    ]);
  });

  it("contains no extra frequency sheet for a Yearly selection", async () => {
    const { workbook } = await roundTrip({ frequency: "yearly" });
    expect(workbook.worksheets.map((ws) => ws.name)).toEqual([
      "Your Selection",
      "Earnings & Principal",
      "Comparison",
    ]);
    expect(sheetText(workbook.getWorksheet(COMPARISON_SHEET_NAME)!)).toContain(
      "Yearly is the longest payout term available",
    );
  });

  it("never reveals an earnings rate", async () => {
    const rates: RateTable = { quarterly: 7.1234, "half-yearly": 8.4321, yearly: 9.5678 };
    for (const frequency of ["quarterly", "half-yearly", "yearly"] as const) {
      const { workbook } = await roundTrip({ frequency, principal: 100_000, lockInYears: 2 }, rates);
      everyCell(workbook, (value, numFmt, where) => {
        expect(numFmt, where).not.toContain("%");
        if (typeof value === "number") {
          for (const rate of Object.values(rates)) {
            expect(value, where).not.toBeCloseTo(rate, 6);
            expect(value, where).not.toBeCloseTo(rate / 100, 8);
          }
        }
        if (typeof value === "string") {
          expect(value, where).not.toMatch(/\d\s*%/);
          expect(value.toLowerCase(), where).not.toContain("rate:");
        }
      });
      const text = workbook.worksheets.map(sheetText).join("\n");
      expect(text).not.toMatch(/Annual (earnings )?rate\b(?! for)/i);
    }
  });

  it("writes the selected schedule with dates, numbers and formulas", async () => {
    const { workbook } = await roundTrip({});
    const ws = workbook.getWorksheet(SELECTION_SHEET_NAME)!;

    expect(detail(ws, "Original investment")).toBe(25_000);
    expect(isoOf(detail(ws, "Planned investment date"))).toBe("2026-01-14");
    expect(isoOf(detail(ws, "Earnings start date"))).toBe("2026-01-15");
    expect(detail(ws, "Payout type")).toBe("Earnings Only");
    expect(detail(ws, "Payout term")).toBe("Quarterly");
    expect(detail(ws, "Total earnings payable")).toBe(2_000);
    expect(detail(ws, "Total amount paid")).toBe(27_000);

    const header = findRow(ws, "Payout No.");
    expect(rowValues(ws, header)).toEqual([
      "Payout No.",
      "Payout Date",
      "Opening Principal",
      "Earnings Amount",
      "Principal Repayment",
      "Total Payout",
      "Remaining Principal",
    ]);
    const first = rowValues(ws, header + 1);
    expect(first[0]).toBe(1);
    expect(isoOf(first[1])).toBe("2026-04-15");
    expect(first.slice(2)).toEqual([25_000, 500, 0, 500, 25_000]);
    expect(rowValues(ws, header + 4).slice(2)).toEqual([25_000, 500, 25_000, 25_500, 0]);
    expect(ws.getRow(header + 2).getCell(3).numFmt).toBe('"$"#,##0.00');

    const totals = ws.getRow(header + 5);
    expect(totals.getCell(1).value).toBe("Total");
    expect(totals.getCell(4).value).toEqual({ formula: `SUM(D${header + 1}:D${header + 4})`, result: 2_000 });
    expect(totals.getCell(5).value).toEqual({ formula: `SUM(E${header + 1}:E${header + 4})`, result: 25_000 });
    expect(totals.getCell(6).value).toEqual({ formula: `SUM(F${header + 1}:F${header + 4})`, result: 27_000 });
    expect(totals.getCell(7).value).toBe(0);

    const text = sheetText(ws);
    expect(text).toContain("not a guarantee of investment performance");
    expect(text).toContain("next business day after the planned investment date");
  });

  it("writes longer-period sheets at their own rates without showing them", async () => {
    const { workbook } = await roundTrip({});
    const half = workbook.getWorksheet("Half-Yearly Payout")!;
    expect(detail(half, "Payout term")).toBe("Half-Yearly");
    expect(detail(half, "Payout type")).toBe("Earnings Only");
    // $25,000 x 9% / 2 = $1,125 per half-year.
    expect(detail(half, "Total earnings payable")).toBe(2_250);
    const header = findRow(half, "Payout No.");
    expect(rowValues(half, header + 1).slice(2)).toEqual([25_000, 1_125, 0, 1_125, 25_000]);
    expect(rowValues(half, header + 2).slice(2)).toEqual([25_000, 1_125, 25_000, 26_125, 0]);

    const yearly = workbook.getWorksheet("Yearly Payout")!;
    expect(detail(yearly, "Total amount paid")).toBe(27_500);
  });

  it("writes the other payout type at the selected frequency", async () => {
    const { workbook } = await roundTrip({});
    const ws = workbook.getWorksheet("Earnings & Principal")!;
    expect(detail(ws, "Payout type")).toBe("Earnings and Principal");
    const header = findRow(ws, "Payout No.");
    expect([1, 2, 3, 4].map((i) => ws.getRow(header + i).getCell(4).value)).toEqual([500, 375, 250, 125]);
    expect(ws.getRow(header + 4).getCell(7).value).toBe(0);
  });

  it("writes a comparison sheet with differences against the selection", async () => {
    const { workbook } = await roundTrip({});
    const ws = workbook.getWorksheet(COMPARISON_SHEET_NAME)!;
    expect(isoOf(detail(ws, "Planned investment date"))).toBe("2026-01-14");
    expect(isoOf(detail(ws, "Earnings start date"))).toBe("2026-01-15");
    expect(detail(ws, "Your selection")).toBe("Quarterly, Earnings Only");

    const longerHeader = findRow(ws, "Scenario");
    expect(rowValues(ws, longerHeader)).toEqual([
      "Scenario",
      "Payout Term",
      "Payout Type",
      "Number of Payouts",
      "First Payout",
      "Final Payout",
      "Total Earnings",
      "Total Paid",
      "Difference vs Your Selection",
    ]);
    expect(rowValues(ws, longerHeader + 1)).toEqual([
      "Your selection", "Quarterly", "Earnings Only", 4, 500, 25_500, 2_000, 27_000, 0,
    ]);
    expect(rowValues(ws, longerHeader + 2)).toEqual([
      "Half-Yearly payout", "Half-Yearly", "Earnings Only", 2, 1_125, 26_125, 2_250, 27_250, 250,
    ]);
    expect(rowValues(ws, longerHeader + 3)).toEqual([
      "Yearly payout", "Yearly", "Earnings Only", 1, 27_500, 27_500, 2_500, 27_500, 500,
    ]);

    const typeHeader = findRow(ws, "Scenario", longerHeader);
    expect(rowValues(ws, typeHeader + 1).slice(0, 3)).toEqual(["Your selection", "Quarterly", "Earnings Only"]);
    expect(rowValues(ws, typeHeader + 2)).toEqual([
      "Other payout type", "Quarterly", "Earnings and Principal", 4, 6_750, 6_375, 1_250, 26_250, -750,
    ]);

    const pairHeader = findRow(ws, "Payout No.");
    expect(rowValues(ws, pairHeader)[4]).toBe("Earnings and Principal minus Earnings Only");
    expect(rowValues(ws, pairHeader + 1).slice(2)).toEqual([500, 6_750, 6_250]);
    expect(rowValues(ws, pairHeader + 4).slice(2)).toEqual([25_500, 6_375, -19_125]);
    expect(rowValues(ws, pairHeader + 5)[0]).toBe("Total");
    expect(rowValues(ws, pairHeader + 5).slice(2)).toEqual([27_000, 26_250, -750]);
  });

  it("makes every note row tall enough for its text", async () => {
    const { workbook } = await roundTrip({ frequency: "quarterly", payoutType: "interest-and-principal" });
    let checked = 0;
    for (const ws of workbook.worksheets) {
      const totalWidth = (ws.columns ?? []).reduce((sum, c) => sum + (c.width ?? 9), 0);
      ws.eachRow((row) => {
        const text = String(row.getCell(1).value ?? "");
        if (!row.getCell(1).isMerged || text.length < 80) return;
        const linesNeeded = Math.ceil(text.length / totalWidth);
        expect(row.height, `${ws.name} row ${row.number}`).toBeGreaterThanOrEqual(linesNeeded * 15);
        checked++;
      });
    }
    expect(checked).toBeGreaterThanOrEqual(10); // notes and disclaimers on every sheet
    const dates = sheetText(workbook.getWorksheet(SELECTION_SHEET_NAME)!);
    expect(dates).toContain("Payout dates are not moved for weekends.");
  });

  it("estimates paragraph heights generously", () => {
    expect(paragraphHeight("short", 140)).toBe(19);
    expect(paragraphHeight("x".repeat(141), 140)).toBe(34);
    expect(paragraphHeight("x".repeat(520), 156)).toBe(64);
  });

  it("lists Earnings Only first in the payout type comparison even when it is not selected", async () => {
    const { workbook } = await roundTrip({ payoutType: "interest-and-principal" });
    const ws = workbook.getWorksheet(COMPARISON_SHEET_NAME)!;
    const typeHeader = findRow(ws, "Scenario", findRow(ws, "Scenario"));
    expect(rowValues(ws, typeHeader + 1).slice(0, 3)).toEqual(["Other payout type", "Quarterly", "Earnings Only"]);
    expect(rowValues(ws, typeHeader + 1)[8]).toBe(750);
    expect(rowValues(ws, typeHeader + 2).slice(0, 3)).toEqual([
      "Your selection",
      "Quarterly",
      "Earnings and Principal",
    ]);
    const pairHeader = findRow(ws, "Payout No.");
    expect(rowValues(ws, findRow(ws, "Total", pairHeader))[4]).toBe(-750);
    expect(sheetText(ws)).toContain("whichever one you selected");
  });
});

import { describe, expect, it } from "vitest";
import {
  addMonths,
  calculatePayoutSchedule,
  PERIODS_PER_YEAR,
  validateRate,
  type PayoutFrequency,
  type PayoutInputs,
  type PayoutSchedule,
  type PayoutType,
} from "./payout";
import { formatCents, formatSignedCents } from "./format";

// Invested Wednesday Jan 14, 2026, so interest starts Thursday Jan 15, 2026.
const INVESTED = "2026-01-14";

function run(overrides: Partial<PayoutInputs>): PayoutSchedule {
  return calculatePayoutSchedule({
    principal: 50_000,
    annualRatePercent: 10,
    lockInYears: 1,
    payoutType: "interest-only",
    frequency: "quarterly",
    investmentDate: INVESTED,
    ...overrides,
  });
}

/** Invariants every schedule must satisfy. */
function expectReconciled(schedule: PayoutSchedule) {
  const { rows, totals, inputs } = schedule;
  const principalCents = inputs.principal * 100;
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + pick(r), 0);

  expect(totals.interestCents).toBe(sum((r) => r.interestCents));
  expect(totals.principalCents).toBe(sum((r) => r.principalRepaymentCents));
  expect(totals.payoutCents).toBe(sum((r) => r.totalPayoutCents));
  expect(totals.principalCents).toBe(principalCents);
  expect(totals.payoutCents).toBe(totals.interestCents + totals.principalCents);
  expect(rows.at(-1)!.remainingPrincipalCents).toBe(0);

  for (const [i, row] of rows.entries()) {
    expect(row.payoutNumber).toBe(i + 1);
    expect(row.interestCents).toBeGreaterThanOrEqual(0);
    expect(row.principalRepaymentCents).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(row.interestCents)).toBe(true);
    expect(Number.isInteger(row.principalRepaymentCents)).toBe(true);
    expect(row.totalPayoutCents).toBe(row.interestCents + row.principalRepaymentCents);
    expect(row.remainingPrincipalCents).toBe(row.openingPrincipalCents - row.principalRepaymentCents);
    if (i > 0) expect(row.openingPrincipalCents).toBe(rows[i - 1].remainingPrincipalCents);
  }
}

describe("required scenarios", () => {
  it("$25,000 at 10%, 1 year, quarterly, Interest Only", () => {
    const s = run({ principal: 25_000, lockInYears: 1, frequency: "quarterly", payoutType: "interest-only" });
    expect(s.rows).toHaveLength(4);
    for (const row of s.rows) expect(row.interestCents).toBe(62_500);
    expect(s.rows.slice(0, 3).map((r) => r.totalPayoutCents)).toEqual([62_500, 62_500, 62_500]);
    expect(s.rows.slice(0, 3).every((r) => r.principalRepaymentCents === 0)).toBe(true);
    const last = s.rows[3];
    expect(last.principalRepaymentCents).toBe(2_500_000);
    expect(last.totalPayoutCents).toBe(2_562_500);
    expect(last.remainingPrincipalCents).toBe(0);
    expect(s.totals).toEqual({ interestCents: 250_000, principalCents: 2_500_000, payoutCents: 2_750_000 });
    expectReconciled(s);
  });

  it("$50,000 at 10%, 2 years, half-yearly, Interest Only", () => {
    const s = run({ principal: 50_000, lockInYears: 2, frequency: "half-yearly", payoutType: "interest-only" });
    expect(s.rows).toHaveLength(4);
    for (const row of s.rows) expect(row.interestCents).toBe(250_000);
    expect(s.rows[3].totalPayoutCents).toBe(5_250_000);
    expect(s.totals).toEqual({ interestCents: 1_000_000, principalCents: 5_000_000, payoutCents: 6_000_000 });
    expectReconciled(s);
  });

  it("$75,000 at 10%, 1 year, yearly, Interest and Principal", () => {
    const s = run({ principal: 75_000, lockInYears: 1, frequency: "yearly", payoutType: "interest-and-principal" });
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({
      openingPrincipalCents: 7_500_000,
      interestCents: 750_000,
      principalRepaymentCents: 7_500_000,
      totalPayoutCents: 8_250_000,
      remainingPrincipalCents: 0,
    });
    expect(s.totals).toEqual({ interestCents: 750_000, principalCents: 7_500_000, payoutCents: 8_250_000 });
    expectReconciled(s);
  });

  it("$100,000 at 0%, 2 years, quarterly, Interest and Principal", () => {
    const s = run({
      principal: 100_000,
      annualRatePercent: 0,
      lockInYears: 2,
      frequency: "quarterly",
      payoutType: "interest-and-principal",
    });
    expect(s.rows).toHaveLength(8);
    for (const row of s.rows) {
      expect(row.interestCents).toBe(0);
      expect(row.principalRepaymentCents).toBe(1_250_000);
    }
    expect(s.rows.map((r) => r.remainingPrincipalCents)).toEqual([
      8_750_000, 7_500_000, 6_250_000, 5_000_000, 3_750_000, 2_500_000, 1_250_000, 0,
    ]);
    expect(s.totals).toEqual({ interestCents: 0, principalCents: 10_000_000, payoutCents: 10_000_000 });
    expectReconciled(s);
  });
});

describe("Interest and Principal", () => {
  it("charges interest only on outstanding principal, so interest decreases", () => {
    const s = run({ principal: 50_000, payoutType: "interest-and-principal", frequency: "quarterly" });
    expect(s.rows.map((r) => r.principalRepaymentCents)).toEqual([1_250_000, 1_250_000, 1_250_000, 1_250_000]);
    expect(s.rows.map((r) => r.interestCents)).toEqual([125_000, 93_750, 62_500, 31_250]);
    for (let i = 1; i < s.rows.length; i++) {
      expect(s.rows[i].interestCents).toBeLessThan(s.rows[i - 1].interestCents);
    }
    expect(s.totals.interestCents).toBe(312_500);
    expectReconciled(s);
  });

  it("$100,000 at 10%, 2 years, half-yearly", () => {
    const s = run({
      principal: 100_000,
      lockInYears: 2,
      frequency: "half-yearly",
      payoutType: "interest-and-principal",
    });
    expect(s.rows.map((r) => r.interestCents)).toEqual([500_000, 375_000, 250_000, 125_000]);
    expect(s.rows.map((r) => r.totalPayoutCents)).toEqual([3_000_000, 2_875_000, 2_750_000, 2_625_000]);
    expectReconciled(s);
  });

  it("final installment reconciles principal that does not divide evenly", () => {
    // 100,300 cents / 8 periods = 12,537.5 -> seven installments of 12,537 and a final 12,541.
    const s = run({ principal: 1_003, lockInYears: 2, payoutType: "interest-and-principal" });
    expect(s.rows.slice(0, 7).every((r) => r.principalRepaymentCents === 12_537)).toBe(true);
    expect(s.rows[7].principalRepaymentCents).toBe(12_541);
    expect(s.rows[7].remainingPrincipalCents).toBe(0);
    expectReconciled(s);
  });
});

describe("Interest Only", () => {
  it("total interest equals principal x rate x years, with the final installment absorbing rounding", () => {
    // 2,500,000 cents x 7.3333% / 4 = 45,833.125 -> 45,833 per quarter.
    // Total = 2,500,000 x 7.3333% x 2 = 366,665 exactly, so the final interest is 45,834.
    const s = run({ principal: 25_000, annualRatePercent: 7.3333, lockInYears: 2 });
    expect(s.rows.slice(0, 7).every((r) => r.interestCents === 45_833)).toBe(true);
    expect(s.rows[7].interestCents).toBe(45_834);
    expect(s.totals.interestCents).toBe(366_665);
    expectReconciled(s);
  });

  it("pays principal only at maturity", () => {
    const s = run({ principal: 75_000, lockInYears: 2, frequency: "quarterly" });
    expect(s.rows.slice(0, -1).every((r) => r.principalRepaymentCents === 0)).toBe(true);
    expect(s.rows.slice(0, -1).every((r) => r.remainingPrincipalCents === 7_500_000)).toBe(true);
    expect(s.rows.at(-1)!.principalRepaymentCents).toBe(7_500_000);
    expectReconciled(s);
  });
});

describe("every frequency and payout type", () => {
  const frequencies: PayoutFrequency[] = ["quarterly", "half-yearly", "yearly"];
  const types: PayoutType[] = ["interest-only", "interest-and-principal"];
  const amounts = [25_000, 50_000, 75_000, 100_000];

  it("maps frequencies to periods per year", () => {
    expect(PERIODS_PER_YEAR).toEqual({ quarterly: 4, "half-yearly": 2, yearly: 1 });
  });

  for (const frequency of frequencies) {
    for (const payoutType of types) {
      for (const lockInYears of [1, 2]) {
        it(`${payoutType}, ${frequency}, ${lockInYears} year(s): correct row count and reconciliation`, () => {
          for (const principal of amounts) {
            for (const annualRatePercent of [0, 10, 12.5, 100]) {
              const s = run({ principal, annualRatePercent, lockInYears, frequency, payoutType });
              expect(s.rows).toHaveLength(lockInYears * PERIODS_PER_YEAR[frequency]);
              expect(s.totalPeriods).toBe(s.rows.length);
              expectReconciled(s);
              if (payoutType === "interest-only") {
                expect(s.totals.interestCents).toBe(
                  Math.round((principal * 100 * annualRatePercent * lockInYears) / 100),
                );
              }
            }
          }
        });
      }
    }
  }
});

describe("zero interest", () => {
  it("returns exactly the principal for both payout types", () => {
    for (const payoutType of ["interest-only", "interest-and-principal"] as const) {
      const s = run({ principal: 25_000, annualRatePercent: 0, payoutType, lockInYears: 2 });
      expect(s.rows.every((r) => r.interestCents === 0)).toBe(true);
      expect(s.totals).toEqual({ interestCents: 0, principalCents: 2_500_000, payoutCents: 2_500_000 });
    }
  });
});

describe("rounding", () => {
  it.each([
    [100_000, 0.0001],
    [25_000, 0.0001],
    [25_000, 0.0004],
    [50_000, 0.0002],
  ])("never pays negative interest: $%d at %d%%, 2 years, quarterly, Interest Only", (principal, rate) => {
    // e.g. $100,000 at 0.0001%: 2.5 cents a quarter, 20 cents in total.
    const s = run({ principal, annualRatePercent: rate, lockInYears: 2, frequency: "quarterly" });
    const interest = s.rows.map((r) => r.interestCents);
    expect(Math.min(...interest)).toBeGreaterThanOrEqual(0);
    expect(interest.at(-1)!).toBeGreaterThanOrEqual(interest[0]);
    expect(s.totals.interestCents).toBe(Math.round((principal * 100 * rate * 2) / 100));
    expectReconciled(s);
  });

  it("keeps every installment non-negative across tiny rates", () => {
    for (const principal of [25_000, 50_000, 75_000, 100_000]) {
      for (let units = 0; units <= 200; units++) {
        const rate = units / 10_000; // 0% to 0.02% in 0.0001% steps
        for (const frequency of ["quarterly", "half-yearly", "yearly"] as const) {
          for (const payoutType of ["interest-only", "interest-and-principal"] as const) {
            expectReconciled(run({ principal, annualRatePercent: rate, lockInYears: 2, frequency, payoutType }));
          }
        }
      }
    }
  });

  it("rounds half a cent up", () => {
    // 2,500,000 cents x 0.0001% = 2.5 cents -> 3 cents.
    const s = run({ principal: 25_000, annualRatePercent: 0.0001, frequency: "yearly" });
    expect(s.rows[0].interestCents).toBe(3);
  });

  it("has no floating point drift for fractional rates", () => {
    // 7.5% on $75,000 per quarter = $1,406.25 exactly.
    const s = run({ principal: 75_000, annualRatePercent: 7.5, payoutType: "interest-and-principal" });
    expect(s.rows[0].interestCents).toBe(140_625);
    expect(formatCents(s.rows[0].interestCents)).toBe("$1,406.25");
    expectReconciled(s);
  });

  it("formats cents to two decimals", () => {
    expect(formatCents(62_500)).toBe("$625.00");
    expect(formatCents(2_562_500)).toBe("$25,625.00");
    expect(formatCents(3)).toBe("$0.03");
    expect(formatCents(2_562_505)).toBe("$25,625.05");
  });
});

describe("validateRate", () => {
  it.each(["0", "100", "10", "7.5", " 12.25 ", ".5", "0.0001"])("accepts %j", (input) => {
    expect(validateRate(input).ok).toBe(true);
  });

  it.each([0, 10, 100])("accepts number %d", (input) => {
    expect(validateRate(input)).toEqual({ ok: true, value: input });
  });

  it.each([
    ["", "Enter an annual interest rate."],
    ["   ", "Enter an annual interest rate."],
    ["abc", "Interest rate must be a number, for example 10 or 7.5."],
    ["10%", "Interest rate must be a number, for example 10 or 7.5."],
    ["1e2", "Interest rate must be a number, for example 10 or 7.5."],
    ["-1", "Interest rate must be between 0% and 100%."],
    ["-0.5", "Interest rate must be between 0% and 100%."],
    ["100.01", "Interest rate must be between 0% and 100%."],
    ["250", "Interest rate must be between 0% and 100%."],
    ["10.12345", "Use at most 4 decimal places."],
  ])("rejects %j", (input, error) => {
    expect(validateRate(input)).toEqual({ ok: false, error });
  });

  it.each([NaN, Infinity, -Infinity, -5, 101])("rejects number %d", (input) => {
    expect(validateRate(input).ok).toBe(false);
  });

  it("calculatePayoutSchedule throws on an invalid rate", () => {
    expect(() => run({ annualRatePercent: -1 })).toThrow(RangeError);
    expect(() => run({ annualRatePercent: 100.5 })).toThrow(RangeError);
    expect(() => run({ annualRatePercent: NaN })).toThrow(RangeError);
  });

  it("calculatePayoutSchedule throws on other invalid inputs", () => {
    expect(() => run({ principal: 0 })).toThrow(RangeError);
    expect(() => run({ lockInYears: 0 })).toThrow(RangeError);
    expect(() => run({ investmentDate: "2026-02-30" })).toThrow(RangeError);
    expect(() => run({ investmentDate: "" })).toThrow(RangeError);
    expect(() => run({ investmentDate: "1999-12-31" })).toThrow(RangeError);
    expect(() => run({ frequency: "monthly" as PayoutFrequency })).toThrow(RangeError);
  });
});

describe("payout dates", () => {
  it("steps by the payout frequency from the start date", () => {
    expect(run({ frequency: "quarterly" }).rows.map((r) => r.payoutDate)).toEqual([
      "2026-04-15",
      "2026-07-15",
      "2026-10-15",
      "2027-01-15",
    ]);
    expect(run({ frequency: "half-yearly", lockInYears: 2 }).rows.map((r) => r.payoutDate)).toEqual([
      "2026-07-15",
      "2027-01-15",
      "2027-07-15",
      "2028-01-15",
    ]);
    expect(run({ frequency: "yearly", lockInYears: 2 }).rows.map((r) => r.payoutDate)).toEqual([
      "2027-01-15",
      "2028-01-15",
    ]);
  });

  it("clamps to month end without drifting", () => {
    // Invested Tuesday Dec 30, 2025, so interest starts Wednesday Dec 31, 2025.
    const s = run({ investmentDate: "2025-12-30" });
    expect(s.startDate).toBe("2025-12-31");
    expect(s.rows.map((r) => r.payoutDate)).toEqual([
      "2026-03-31",
      "2026-06-30",
      "2026-09-30",
      "2026-12-31",
    ]);
    expect(addMonths("2027-08-31", 6)).toBe("2028-02-29");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });
});

describe("formatSignedCents", () => {
  it("shows an explicit sign", () => {
    expect(formatSignedCents(100_000)).toBe("+$1,000.00");
    expect(formatSignedCents(-62_550)).toBe("−$625.50");
    expect(formatSignedCents(0)).toBe("$0.00");
  });
});

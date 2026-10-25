import { describe, expect, it } from "vitest";
import { calculatePayoutSchedule, type PayoutInputs } from "./payout";
import {
  buildScenarios,
  differenceInCents,
  longerFrequencies,
  otherPayoutType,
  scheduleMetrics,
  usesStandardRate,
} from "./scenarios";

function scenariosFor(overrides: Partial<PayoutInputs>) {
  return buildScenarios(
    calculatePayoutSchedule({
      principal: 50_000,
      annualRatePercent: 8,
      lockInYears: 1,
      payoutType: "interest-only",
      frequency: "quarterly",
      startDate: "2026-01-15",
      ...overrides,
    }),
  );
}

describe("longerFrequencies", () => {
  it("lists only frequencies that pay less often", () => {
    expect(longerFrequencies("quarterly")).toEqual(["half-yearly", "yearly"]);
    expect(longerFrequencies("half-yearly")).toEqual(["yearly"]);
    expect(longerFrequencies("yearly")).toEqual([]);
  });
});

describe("otherPayoutType", () => {
  it("swaps the payout type", () => {
    expect(otherPayoutType("interest-only")).toBe("interest-and-principal");
    expect(otherPayoutType("interest-and-principal")).toBe("interest-only");
  });
});

describe("buildScenarios", () => {
  it("Quarterly selection compares Half-Yearly at 9% and Yearly at 10%", () => {
    const s = scenariosFor({ frequency: "quarterly", annualRatePercent: 8 });
    expect(s.selected.totals.interestCents).toBe(400_000);
    expect(s.longerFrequencies.map((x) => x.inputs.frequency)).toEqual(["half-yearly", "yearly"]);
    expect(s.longerFrequencies.map((x) => x.inputs.annualRatePercent)).toEqual([9, 10]);

    const [half, yearly] = s.longerFrequencies;
    expect(half.rows.map((r) => r.interestCents)).toEqual([225_000, 225_000]);
    expect(half.totals.interestCents).toBe(450_000);
    expect(yearly.rows.map((r) => r.interestCents)).toEqual([500_000]);
    expect(differenceInCents(half, s.selected)).toBe(50_000);
    expect(differenceInCents(yearly, s.selected)).toBe(100_000);
  });

  it("Half-Yearly selection compares only Yearly", () => {
    const s = scenariosFor({ frequency: "half-yearly", annualRatePercent: 9, lockInYears: 2 });
    expect(s.longerFrequencies).toHaveLength(1);
    expect(s.longerFrequencies[0].inputs).toMatchObject({ frequency: "yearly", annualRatePercent: 10 });
    expect(s.longerFrequencies[0].rows).toHaveLength(2);
    expect(s.longerFrequencies[0].totals.interestCents).toBe(1_000_000);
  });

  it("Yearly selection has no longer-period scenario", () => {
    expect(scenariosFor({ frequency: "yearly", annualRatePercent: 10 }).longerFrequencies).toEqual([]);
  });

  it("keeps the payout type, amount, term and start date in longer-period scenarios", () => {
    const s = scenariosFor({ payoutType: "interest-and-principal", principal: 75_000, lockInYears: 2 });
    for (const x of s.longerFrequencies) {
      expect(x.inputs).toMatchObject({
        payoutType: "interest-and-principal",
        principal: 75_000,
        lockInYears: 2,
        startDate: "2026-01-15",
      });
    }
  });

  it("uses standard rates for longer periods even when the visitor typed a rate", () => {
    const s = scenariosFor({ annualRatePercent: 12 });
    expect(s.longerFrequencies.map((x) => x.inputs.annualRatePercent)).toEqual([9, 10]);
    expect(s.otherPayoutType.inputs.annualRatePercent).toBe(12);
  });

  it("other payout type keeps the frequency and rate", () => {
    const s = scenariosFor({ payoutType: "interest-only", frequency: "quarterly", annualRatePercent: 8 });
    const other = s.otherPayoutType;
    expect(other.inputs).toMatchObject({
      payoutType: "interest-and-principal",
      frequency: "quarterly",
      annualRatePercent: 8,
    });
    expect(other.rows.map((r) => r.interestCents)).toEqual([100_000, 75_000, 50_000, 25_000]);
    expect(other.totals.interestCents).toBe(250_000);
    expect(differenceInCents(other, s.selected)).toBe(-150_000);
  });

  it("Interest and Principal selection compares against Interest Only", () => {
    const s = scenariosFor({ payoutType: "interest-and-principal" });
    expect(s.otherPayoutType.inputs.payoutType).toBe("interest-only");
    expect(differenceInCents(s.otherPayoutType, s.selected)).toBe(150_000);
  });
});

describe("scheduleMetrics", () => {
  it("summarizes first and final payouts and totals", () => {
    const s = scenariosFor({});
    expect(scheduleMetrics(s.selected)).toEqual({
      payouts: 4,
      firstPayoutCents: 100_000,
      finalPayoutCents: 5_100_000,
      totalInterestCents: 400_000,
      totalPrincipalCents: 5_000_000,
      totalPaidCents: 5_400_000,
    });
  });
});

describe("usesStandardRate", () => {
  it("compares the rate with the frequency's standard rate", () => {
    expect(usesStandardRate(scenariosFor({ annualRatePercent: 8 }).selected)).toBe(true);
    expect(usesStandardRate(scenariosFor({ annualRatePercent: 8.5 }).selected)).toBe(false);
    expect(usesStandardRate(scenariosFor({ frequency: "yearly", annualRatePercent: 10 }).selected)).toBe(true);
  });
});

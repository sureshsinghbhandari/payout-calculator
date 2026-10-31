import { describe, expect, it } from "vitest";
import type { RateTable } from "./rates";
import {
  buildScenarios,
  differenceInCents,
  longerFrequencies,
  otherPayoutType,
  scheduleMetrics,
  toPublicScenarioSet,
  type QuoteInputs,
} from "./scenarios";

const RATES: RateTable = { quarterly: 8, "half-yearly": 9, yearly: 10 };

function scenariosFor(overrides: Partial<QuoteInputs>, rates: RateTable = RATES) {
  return buildScenarios(
    {
      principal: 50_000,
      lockInYears: 1,
      payoutType: "interest-only",
      frequency: "quarterly",
      investmentDate: "2026-01-14",
      ...overrides,
    },
    rates,
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
  it("applies each frequency's rate from the rate table", () => {
    const s = scenariosFor({ frequency: "quarterly" });
    expect(s.selected.inputs.annualRatePercent).toBe(8);
    expect(s.selected.totals.interestCents).toBe(400_000);
    expect(s.longerFrequencies.map((x) => x.inputs.frequency)).toEqual(["half-yearly", "yearly"]);
    expect(s.longerFrequencies.map((x) => x.inputs.annualRatePercent)).toEqual([9, 10]);

    const [half, yearly] = s.longerFrequencies;
    expect(half.rows.map((r) => r.interestCents)).toEqual([225_000, 225_000]);
    expect(yearly.rows.map((r) => r.interestCents)).toEqual([500_000]);
    expect(differenceInCents(half, s.selected)).toBe(50_000);
    expect(differenceInCents(yearly, s.selected)).toBe(100_000);
  });

  it("uses admin-changed rates", () => {
    const s = scenariosFor({ frequency: "quarterly" }, { quarterly: 6, "half-yearly": 7.5, yearly: 12 });
    expect(s.selected.totals.interestCents).toBe(300_000);
    expect(s.longerFrequencies.map((x) => x.totals.interestCents)).toEqual([375_000, 600_000]);
    expect(s.otherPayoutType.inputs.annualRatePercent).toBe(6);
  });

  it("Half-Yearly selection compares only Yearly", () => {
    const s = scenariosFor({ frequency: "half-yearly", lockInYears: 2 });
    expect(s.longerFrequencies).toHaveLength(1);
    expect(s.longerFrequencies[0].inputs).toMatchObject({ frequency: "yearly", annualRatePercent: 10 });
    expect(s.longerFrequencies[0].totals.interestCents).toBe(1_000_000);
  });

  it("Yearly selection has no longer-period scenario", () => {
    expect(scenariosFor({ frequency: "yearly" }).longerFrequencies).toEqual([]);
  });

  it("keeps the payout type, amount, term and investment date in every scenario", () => {
    const s = scenariosFor({ payoutType: "interest-and-principal", principal: 75_000, lockInYears: 2 });
    for (const x of [...s.longerFrequencies, s.otherPayoutType]) {
      expect(x.inputs).toMatchObject({ principal: 75_000, lockInYears: 2, investmentDate: "2026-01-14" });
      expect(x.startDate).toBe("2026-01-15");
    }
    for (const x of s.longerFrequencies) expect(x.inputs.payoutType).toBe("interest-and-principal");
  });

  it("other payout type keeps the frequency and rate", () => {
    const s = scenariosFor({ payoutType: "interest-only", frequency: "quarterly" });
    expect(s.otherPayoutType.inputs).toMatchObject({
      payoutType: "interest-and-principal",
      frequency: "quarterly",
      annualRatePercent: 8,
    });
    expect(s.otherPayoutType.rows.map((r) => r.interestCents)).toEqual([100_000, 75_000, 50_000, 25_000]);
    expect(differenceInCents(s.otherPayoutType, s.selected)).toBe(-150_000);
  });
});

describe("toPublicScenarioSet", () => {
  it("removes every trace of the earnings rate", () => {
    const set = toPublicScenarioSet(scenariosFor({ frequency: "quarterly" }, { quarterly: 7.1234, "half-yearly": 9, yearly: 10 }));
    const json = JSON.stringify(set);
    expect(json).not.toContain("annualRatePercent");
    expect(json).not.toContain("7.1234");
    expect(set.selected.inputs).toEqual({
      principal: 50_000,
      lockInYears: 1,
      payoutType: "interest-only",
      frequency: "quarterly",
      investmentDate: "2026-01-14",
    });
  });

  it("keeps the numbers", () => {
    const full = scenariosFor({});
    const pub = toPublicScenarioSet(full);
    expect(pub.selected.rows).toEqual(full.selected.rows);
    expect(pub.selected.totals).toEqual(full.selected.totals);
    expect(pub.selected.startDate).toBe(full.selected.startDate);
    expect(pub.longerFrequencies.map((s) => s.totals)).toEqual(full.longerFrequencies.map((s) => s.totals));
    expect(pub.otherPayoutType.rows).toEqual(full.otherPayoutType.rows);
  });
});

describe("scheduleMetrics", () => {
  it("summarizes first and final payouts and totals", () => {
    expect(scheduleMetrics(scenariosFor({}).selected)).toEqual({
      payouts: 4,
      firstPayoutCents: 100_000,
      finalPayoutCents: 5_100_000,
      totalInterestCents: 400_000,
      totalPrincipalCents: 5_000_000,
      totalPaidCents: 5_400_000,
    });
  });
});

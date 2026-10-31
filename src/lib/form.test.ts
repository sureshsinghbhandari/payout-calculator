import { describe, expect, it } from "vitest";
import { DEFAULT_RATE_BY_FREQUENCY } from "./config";
import { effectiveInvestmentDate, initialFormState } from "./form";

describe("form defaults", () => {
  it("start at $100,000, 2 years, Yearly, Earnings Only, investing today", () => {
    expect(initialFormState()).toEqual({
      principal: 100_000,
      lockInYears: 2,
      payoutType: "interest-only",
      frequency: "yearly",
      investmentDate: null,
    });
  });

  it("have no earnings rate field", () => {
    expect(Object.keys(initialFormState())).not.toContain("rateText");
  });

  it("starting rates are Quarterly 8%, Half-Yearly 9%, Yearly 10% until an admin changes them", () => {
    expect(DEFAULT_RATE_BY_FREQUENCY).toEqual({ quarterly: 8, "half-yearly": 9, yearly: 10 });
  });
});

describe("effectiveInvestmentDate", () => {
  it("uses today until the visitor picks a date", () => {
    const form = initialFormState();
    expect(effectiveInvestmentDate(form, "2026-10-25")).toBe("2026-10-25");
    expect(effectiveInvestmentDate({ ...form, investmentDate: "2026-11-02" }, "2026-10-25")).toBe("2026-11-02");
    expect(effectiveInvestmentDate({ ...form, investmentDate: "" }, "2026-10-25")).toBe("");
  });
});

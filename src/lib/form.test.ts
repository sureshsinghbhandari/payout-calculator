import { describe, expect, it } from "vitest";
import { DEFAULT_RATE_BY_FREQUENCY } from "./config";
import {
  canUseStandardRate,
  initialFormState,
  isStandardRate,
  standardRate,
  withFrequency,
  withRateText,
  withStandardRate,
} from "./form";

describe("standard rates by payout frequency", () => {
  it("are Quarterly 8%, Half-Yearly 9%, Yearly 10%", () => {
    expect(DEFAULT_RATE_BY_FREQUENCY).toEqual({ quarterly: 8, "half-yearly": 9, yearly: 10 });
    expect(standardRate("quarterly")).toBe(8);
    expect(standardRate("half-yearly")).toBe(9);
    expect(standardRate("yearly")).toBe(10);
  });

  it("start the form at Quarterly with 8%", () => {
    expect(initialFormState()).toEqual({
      principal: 50_000,
      lockInYears: 1,
      payoutType: "interest-only",
      frequency: "quarterly",
      rateText: "8",
      rateCustomized: false,
    });
  });
});

describe("rate follows the frequency until the visitor changes it", () => {
  it("moves to the standard rate of each frequency", () => {
    let form = initialFormState();
    form = withFrequency(form, "half-yearly");
    expect(form).toMatchObject({ frequency: "half-yearly", rateText: "9", rateCustomized: false });
    form = withFrequency(form, "yearly");
    expect(form).toMatchObject({ frequency: "yearly", rateText: "10", rateCustomized: false });
    form = withFrequency(form, "quarterly");
    expect(form).toMatchObject({ frequency: "quarterly", rateText: "8", rateCustomized: false });
  });

  it("keeps a rate the visitor typed when the frequency changes", () => {
    let form = withRateText(initialFormState(), "12.5");
    expect(form.rateCustomized).toBe(true);
    form = withFrequency(form, "yearly");
    expect(form).toMatchObject({ frequency: "yearly", rateText: "12.5", rateCustomized: true });
  });

  it("keeps invalid text so the visitor can fix it", () => {
    const form = withFrequency(withRateText(initialFormState(), "abc"), "half-yearly");
    expect(form).toMatchObject({ rateText: "abc", rateCustomized: true });
  });

  it("treats typing the standard rate as following the standard again", () => {
    let form = withRateText(initialFormState(), "11");
    form = withRateText(form, "8.0");
    expect(form.rateCustomized).toBe(false);
    form = withFrequency(form, "half-yearly");
    expect(form.rateText).toBe("9");
  });

  it("keeps a typed rate through a round trip, even when it matches another standard rate", () => {
    let form = withRateText(initialFormState(), "10");
    expect(form.rateCustomized).toBe(true);
    form = withFrequency(form, "yearly");
    expect(form).toMatchObject({ rateText: "10", rateCustomized: true });
    expect(canUseStandardRate(form)).toBe(false); // 10% is already the Yearly standard
    form = withFrequency(form, "quarterly");
    expect(form).toMatchObject({ frequency: "quarterly", rateText: "10", rateCustomized: true });
    expect(canUseStandardRate(form)).toBe(true);

    let nine = withRateText(initialFormState(), "9");
    nine = withFrequency(withFrequency(withFrequency(nine, "half-yearly"), "yearly"), "quarterly");
    expect(nine.rateText).toBe("9");
  });

  it("offers the standard rate only when the rate differs from it", () => {
    expect(canUseStandardRate(initialFormState())).toBe(false);
    expect(canUseStandardRate(withRateText(initialFormState(), "12"))).toBe(true);
    expect(canUseStandardRate(withRateText(initialFormState(), ""))).toBe(true);
    expect(canUseStandardRate(withRateText(initialFormState(), "150"))).toBe(true);
  });

  it("can switch back to the standard rate", () => {
    let form = withFrequency(withRateText(initialFormState(), "15"), "half-yearly");
    form = withStandardRate(form);
    expect(form).toMatchObject({ frequency: "half-yearly", rateText: "9", rateCustomized: false });
  });

  it("recognizes standard rates", () => {
    expect(isStandardRate("8", "quarterly")).toBe(true);
    expect(isStandardRate(" 8.00 ", "quarterly")).toBe(true);
    expect(isStandardRate("8", "yearly")).toBe(false);
    expect(isStandardRate("", "quarterly")).toBe(false);
    expect(isStandardRate("abc", "quarterly")).toBe(false);
  });
});

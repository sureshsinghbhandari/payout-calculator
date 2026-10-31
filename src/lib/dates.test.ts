import { describe, expect, it } from "vitest";
import { addBusinessDays, addDays, dayOfWeek, isBusinessDay } from "./dates";
import { calculatePayoutSchedule, interestStartDate, validateInvestmentDate } from "./payout";

describe("business days (Monday to Friday, holidays ignored)", () => {
  it("knows weekdays from weekends", () => {
    expect(dayOfWeek("2026-10-25")).toBe(0); // Sunday
    expect(isBusinessDay("2026-10-24")).toBe(false); // Saturday
    expect(isBusinessDay("2026-10-25")).toBe(false); // Sunday
    expect(isBusinessDay("2026-10-26")).toBe(true); // Monday
    expect(isBusinessDay("2026-10-30")).toBe(true); // Friday
  });

  it.each([
    ["2026-10-26", "2026-10-27", "Monday -> Tuesday"],
    ["2026-01-14", "2026-01-15", "Wednesday -> Thursday"],
    ["2026-10-23", "2026-10-26", "Friday -> Monday"],
    ["2026-10-24", "2026-10-26", "Saturday -> Monday"],
    ["2026-10-25", "2026-10-26", "Sunday -> Monday"],
    ["2026-12-31", "2027-01-01", "across a year end, holiday ignored"],
    ["2026-12-24", "2026-12-25", "Christmas Day still counts"],
    ["2026-07-03", "2026-07-06", "Friday before July 4 -> Monday"],
    ["2028-02-28", "2028-02-29", "leap day"],
  ])("%s -> %s (%s)", (from, to) => {
    expect(addBusinessDays(from, 1)).toBe(to);
    expect(interestStartDate(from)).toBe(to);
  });

  it("counts several business days", () => {
    expect(addBusinessDays("2026-10-26", 5)).toBe("2026-11-02"); // Monday + 5 -> next Monday
    expect(addBusinessDays("2026-10-24", 5)).toBe("2026-10-30"); // Saturday + 5 -> Friday
    expect(addBusinessDays("2026-10-26", 0)).toBe("2026-10-26");
  });

  it("adds calendar days across months", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("validateInvestmentDate", () => {
  it("accepts dates in range", () => {
    expect(validateInvestmentDate("2026-10-25")).toEqual({ ok: true, value: "2026-10-25" });
    expect(validateInvestmentDate(" 2000-01-01 ")).toEqual({ ok: true, value: "2000-01-01" });
    expect(validateInvestmentDate("2099-12-31")).toEqual({ ok: true, value: "2099-12-31" });
  });

  it.each([
    ["", "Enter a planned investment date."],
    ["   ", "Enter a planned investment date."],
    ["25/10/2026", "Enter a valid planned investment date."],
    ["2026-02-30", "Enter a valid planned investment date."],
    ["2026-13-01", "Enter a valid planned investment date."],
    ["1999-12-31", "Choose a date between 2000 and 2099."],
    ["2100-01-01", "Choose a date between 2000 and 2099."],
  ])("rejects %j", (input, error) => {
    expect(validateInvestmentDate(input)).toEqual({ ok: false, error });
  });
});

describe("schedule dates", () => {
  it("starts earnings the next business day and counts payouts from there", () => {
    // Invested Friday Oct 23, 2026 -> earnings start Monday Oct 26, 2026.
    const s = calculatePayoutSchedule({
      principal: 100_000,
      annualRatePercent: 10,
      lockInYears: 2,
      payoutType: "interest-only",
      frequency: "yearly",
      investmentDate: "2026-10-23",
    });
    expect(s.inputs.investmentDate).toBe("2026-10-23");
    expect(s.startDate).toBe("2026-10-26");
    expect(s.rows.map((r) => r.payoutDate)).toEqual(["2027-10-26", "2028-10-26"]);
  });

  it("does not move payout dates that land on a weekend", () => {
    // Earnings start Friday Dec 25, 2026; the second payout, Dec 25, 2027, is a Saturday.
    const s = calculatePayoutSchedule({
      principal: 25_000,
      annualRatePercent: 8,
      lockInYears: 1,
      payoutType: "interest-only",
      frequency: "half-yearly",
      investmentDate: "2026-12-24", // Thursday -> earnings start Friday Dec 25, 2026
    });
    expect(s.startDate).toBe("2026-12-25");
    expect(s.rows.map((r) => r.payoutDate)).toEqual(["2027-06-25", "2027-12-25"]);
    expect(isBusinessDay("2027-12-25")).toBe(false); // Saturday, left as is
  });
});

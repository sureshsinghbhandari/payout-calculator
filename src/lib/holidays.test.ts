import { describe, expect, it } from "vitest";
import { isUSFederalHoliday } from "./holidays";

describe("isUSFederalHoliday", () => {
  it.each([
    ["2026-01-01", "New Year's Day 2026 (Thursday)"],
    ["2026-01-19", "Martin Luther King Jr. Day 2026 (3rd Monday of January)"],
    ["2026-02-16", "Washington's Birthday 2026 (3rd Monday of February)"],
    ["2026-05-25", "Memorial Day 2026 (last Monday of May)"],
    ["2026-06-19", "Juneteenth 2026 (Friday)"],
    ["2026-07-03", "Independence Day 2026 observed (July 4 is a Saturday)"],
    ["2026-09-07", "Labor Day 2026 (1st Monday of September)"],
    ["2026-10-12", "Columbus Day 2026 (2nd Monday of October)"],
    ["2026-11-11", "Veterans Day 2026 (Wednesday)"],
    ["2026-11-26", "Thanksgiving 2026 (4th Thursday of November)"],
    ["2026-12-25", "Christmas Day 2026 (Friday)"],
    ["2025-01-01", "New Year's Day 2025 (Wednesday)"],
    ["2025-01-20", "Martin Luther King Jr. Day 2025"],
    ["2025-02-17", "Washington's Birthday 2025"],
    ["2025-05-26", "Memorial Day 2025"],
    ["2025-06-19", "Juneteenth 2025 (Thursday)"],
    ["2025-07-04", "Independence Day 2025 (Friday)"],
    ["2025-09-01", "Labor Day 2025"],
    ["2025-10-13", "Columbus Day 2025"],
    ["2025-11-11", "Veterans Day 2025 (Tuesday)"],
    ["2025-11-27", "Thanksgiving 2025"],
    ["2025-12-25", "Christmas Day 2025 (Thursday)"],
  ])("%s is a US federal holiday (%s)", (iso) => {
    expect(isUSFederalHoliday(iso)).toBe(true);
  });

  it.each([
    ["2026-07-04", "2026-07-03", "Independence Day falls on a Saturday -> observed the preceding Friday"],
    ["2027-07-04", "2027-07-05", "Independence Day falls on a Sunday -> observed the following Monday"],
    ["2027-12-25", "2027-12-24", "Christmas Day falls on a Saturday -> observed the preceding Friday"],
    ["2033-12-25", "2033-12-26", "Christmas Day falls on a Sunday -> observed the following Monday"],
    ["2028-01-01", "2027-12-31", "New Year's Day falls on a Saturday -> observed the preceding Friday (previous year)"],
  ])("%s shifts to %s (%s)", (nominalIso, observedIso) => {
    // The nominal date itself is a weekend and so is never a business day
    // regardless; what matters is that the *observed* weekday is flagged.
    expect(isUSFederalHoliday(observedIso)).toBe(true);
    expect(isUSFederalHoliday(nominalIso)).toBe(nominalIso === observedIso);
  });

  it.each([
    ["2026-01-02", "day after New Year's Day"],
    ["2026-03-17", "an ordinary weekday"],
    ["2026-07-06", "the Monday after Independence Day weekend"],
    ["2026-11-27", "the day after Thanksgiving (Black Friday is not a federal holiday)"],
    ["2026-12-24", "Christmas Eve"],
    ["2026-12-26", "the day after Christmas"],
  ])("%s is not a US federal holiday (%s)", (iso) => {
    expect(isUSFederalHoliday(iso)).toBe(false);
  });
});

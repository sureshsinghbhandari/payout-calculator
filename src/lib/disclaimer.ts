import { INTEREST_START_BUSINESS_DAYS } from "./config";

const startTiming =
  INTEREST_START_BUSINESS_DAYS === 1
    ? "on the next business day after the investment date"
    : `${INTEREST_START_BUSINESS_DAYS} business days after the investment date`;

export const DISCLAIMER =
  "This calculator provides illustrative estimates based on the selected assumptions. " +
  `Interest is assumed to start ${startTiming}, counting Monday to Friday as business days; public holidays are not taken into account. ` +
  "Actual returns, payment timing, taxes, fees, and principal repayment may differ. " +
  "This calculator is not a guarantee of investment performance or a substitute for professional financial advice.";

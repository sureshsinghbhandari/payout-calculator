/**
 * Calculator form state. The interest rate is not part of the form: it is
 * managed by an admin and applied on the server.
 */
import {
  DEFAULT_FREQUENCY,
  DEFAULT_INVESTMENT_AMOUNT,
  DEFAULT_LOCK_IN_YEARS,
  DEFAULT_PAYOUT_TYPE,
} from "./config";
import type { PayoutFrequency, PayoutType } from "./payout";

export interface FormState {
  principal: number;
  lockInYears: number;
  payoutType: PayoutType;
  frequency: PayoutFrequency;
  /** YYYY-MM-DD typed by the visitor, or null to use today's date. */
  investmentDate: string | null;
}

export function initialFormState(): FormState {
  return {
    principal: DEFAULT_INVESTMENT_AMOUNT,
    lockInYears: DEFAULT_LOCK_IN_YEARS,
    payoutType: DEFAULT_PAYOUT_TYPE,
    frequency: DEFAULT_FREQUENCY,
    investmentDate: null,
  };
}

/** The investment date to use: what the visitor entered, or today. */
export function effectiveInvestmentDate(form: FormState, today: string): string {
  return form.investmentDate ?? today;
}

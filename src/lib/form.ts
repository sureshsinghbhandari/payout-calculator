/**
 * Calculator form state. The interest rate is not part of the form: it is
 * managed by an admin and applied on the server.
 */
import { DEFAULT_PAYOUT_TYPE } from "./config";
import type { PayoutFrequency, PayoutType } from "./payout";
import { defaultProductSettings, type ProductSettings } from "./products";

export interface FormState {
  principal: number;
  lockInYears: number;
  payoutType: PayoutType;
  frequency: PayoutFrequency;
  /** YYYY-MM-DD typed by the visitor, or null to use today's date. */
  investmentDate: string | null;
}

/** The form's starting values: the defaults from Settings > Amounts and terms. */
export function initialFormState(products: ProductSettings = defaultProductSettings()): FormState {
  return {
    principal: products.defaultAmount,
    lockInYears: products.defaultTerm,
    payoutType: DEFAULT_PAYOUT_TYPE,
    frequency: products.defaultFrequency,
    investmentDate: null,
  };
}

/** The investment date to use: what the visitor entered, or today. */
export function effectiveInvestmentDate(form: FormState, today: string): string {
  return form.investmentDate ?? today;
}

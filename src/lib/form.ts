/**
 * Form state rules for the calculator, kept free of React so they can be tested.
 *
 * The interest rate follows the standard rate for the selected payout frequency
 * until the visitor types a different rate. After that, the visitor's rate is
 * kept when the frequency changes, and they can switch back to the standard rate.
 */
import {
  DEFAULT_FREQUENCY,
  DEFAULT_INVESTMENT_AMOUNT,
  DEFAULT_LOCK_IN_YEARS,
  DEFAULT_PAYOUT_TYPE,
  DEFAULT_RATE_BY_FREQUENCY,
} from "./config";
import { validateRate, type PayoutFrequency, type PayoutType } from "./payout";

export interface FormState {
  principal: number;
  lockInYears: number;
  payoutType: PayoutType;
  frequency: PayoutFrequency;
  /** Raw text of the rate field. */
  rateText: string;
  /**
   * True when the visitor typed a rate other than the standard rate at the
   * time. A typed rate is kept when the frequency changes.
   */
  rateCustomized: boolean;
}

export function standardRate(frequency: PayoutFrequency): number {
  return DEFAULT_RATE_BY_FREQUENCY[frequency];
}

export function standardRateText(frequency: PayoutFrequency): string {
  return String(standardRate(frequency));
}

/** True when `rateText` is a valid rate equal to the frequency's standard rate. */
export function isStandardRate(rateText: string, frequency: PayoutFrequency): boolean {
  const result = validateRate(rateText);
  return result.ok && result.value === standardRate(frequency);
}

export function initialFormState(): FormState {
  return {
    principal: DEFAULT_INVESTMENT_AMOUNT,
    lockInYears: DEFAULT_LOCK_IN_YEARS,
    payoutType: DEFAULT_PAYOUT_TYPE,
    frequency: DEFAULT_FREQUENCY,
    rateText: standardRateText(DEFAULT_FREQUENCY),
    rateCustomized: false,
  };
}

/**
 * Changes the frequency. The rate moves to the new standard rate unless the
 * visitor typed their own rate, which is then kept as it is. Only typing or
 * choosing the standard rate changes `rateCustomized`.
 */
export function withFrequency(form: FormState, frequency: PayoutFrequency): FormState {
  if (form.rateCustomized) return { ...form, frequency };
  return { ...form, frequency, rateText: standardRateText(frequency), rateCustomized: false };
}

/** Whether to offer switching to the standard rate for the current frequency. */
export function canUseStandardRate(form: FormState): boolean {
  return form.rateCustomized && !isStandardRate(form.rateText, form.frequency);
}

/** Records a typed rate. Typing the standard rate counts as following it again. */
export function withRateText(form: FormState, rateText: string): FormState {
  return { ...form, rateText, rateCustomized: !isStandardRate(rateText, form.frequency) };
}

/** Puts the rate back to the standard rate for the current frequency. */
export function withStandardRate(form: FormState): FormState {
  return { ...form, rateText: standardRateText(form.frequency), rateCustomized: false };
}

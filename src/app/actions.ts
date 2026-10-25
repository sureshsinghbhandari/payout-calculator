"use server";

import { parseQuoteInputs } from "@/lib/quote";
import { buildScenarios, toPublicScenarioSet, type PublicScenarioSet } from "@/lib/scenarios";
import { getCurrentRates } from "@/lib/server/rates-store";

export type QuoteResult = { ok: true; result: PublicScenarioSet } | { ok: false; error: string };

/**
 * Calculates the payout schedule and comparison scenarios on the server using
 * the admin-managed rates. The rates themselves are not included in the result.
 */
export async function calculateQuoteAction(input: unknown): Promise<QuoteResult> {
  const parsed = parseQuoteInputs(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  try {
    const rates = await getCurrentRates();
    return { ok: true, result: toPublicScenarioSet(buildScenarios(parsed.value, rates)) };
  } catch (error) {
    console.error("Quote calculation failed", error);
    return { ok: false, error: "The calculator is temporarily unavailable. Please try again." };
  }
}

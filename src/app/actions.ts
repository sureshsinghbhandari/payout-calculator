"use server";

import type { ProductSettings } from "@/lib/products";
import { parseQuoteInputs } from "@/lib/quote";
import { buildScenarios, toPublicScenarioSet, type PublicScenarioSet } from "@/lib/scenarios";
import { getCurrentProducts } from "@/lib/server/products-store";
import { getCurrentRates } from "@/lib/server/rates-store";

export type QuoteResult = { ok: true; result: PublicScenarioSet } | { ok: false; error: string };

const UNAVAILABLE = "The calculator is temporarily unavailable. Please try again.";

/**
 * Calculates the payout schedule and comparison scenarios on the server using
 * the admin-managed rates. Only the amounts and terms on offer are accepted.
 * The rates themselves are not included in the result.
 */
export async function calculateQuoteAction(input: unknown): Promise<QuoteResult> {
  let products: ProductSettings;
  try {
    products = await getCurrentProducts();
  } catch (error) {
    console.error("Reading amounts and terms failed", error);
    return { ok: false, error: UNAVAILABLE };
  }
  const parsed = parseQuoteInputs(input, products);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  try {
    const rates = await getCurrentRates();
    return { ok: true, result: toPublicScenarioSet(buildScenarios(parsed.value, rates, products.frequencies)) };
  } catch (error) {
    console.error("Quote calculation failed", error);
    return { ok: false, error: UNAVAILABLE };
  }
}

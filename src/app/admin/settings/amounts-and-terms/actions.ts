"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { adminActor } from "@/lib/audit";
import {
  describeProductChange,
  PRODUCT_LIMITS,
  splitAmountLines,
  validateProductSettings,
  type ProductField,
  type ProductSettings,
} from "@/lib/products";
import { recordAudit } from "@/lib/server/audit-store";
import { requireAdminPermission } from "@/lib/server/auth";
import {
  isProductStorageConfigured,
  PRODUCTS_TAG,
  readStoredProducts,
  saveProducts,
} from "@/lib/server/products-store";

/** Saves the amounts and terms on offer (Master Admin, Settings > Amounts and terms). */

export interface SaveProductsState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<ProductField, string>>;
}

const PAGE = "/admin/settings/amounts-and-terms";
const AMOUNTS_TEXT_MAX = 2_000;

export async function saveProductsAction(_prev: SaveProductsState, formData: FormData): Promise<SaveProductsState> {
  const user = await requireAdminPermission("products.manage");
  if (!user) return { status: "error", message: "You do not have access to amounts and terms, or your session has ended." };

  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const list = (name: string) => formData.getAll(name).filter((v): v is string => typeof v === "string");

  // Far more text than 30 amounts need is rejected before parsing it line by line.
  const amountsText = text("amounts");
  if (amountsText.length > AMOUNTS_TEXT_MAX) {
    return {
      status: "error",
      message: "Fix the highlighted settings.",
      fieldErrors: { amounts: `Offer at most ${PRODUCT_LIMITS.maxAmounts} amounts.` },
    };
  }
  const result = validateProductSettings({
    amounts: splitAmountLines(amountsText),
    defaultAmount: text("defaultAmount").trim(),
    terms: list("terms").slice(0, 100),
    defaultTerm: text("defaultTerm").trim(),
    frequencies: list("frequencies").slice(0, 10),
    defaultFrequency: text("defaultFrequency"),
  });
  if (!result.ok) return { status: "error", message: "Fix the highlighted settings.", fieldErrors: result.errors };
  if (!isProductStorageConfigured()) {
    return { status: "error", message: "Storage is not connected, so amounts and terms cannot be saved." };
  }

  let before: ProductSettings | null = null;
  try {
    before = (await readStoredProducts()).settings;
  } catch {
    // The audit entry then lists the new settings only.
  }
  try {
    await saveProducts(result.value, new Date().toISOString());
  } catch (error) {
    console.error("Saving amounts and terms failed", error);
    return { status: "error", message: "The amounts and terms could not be saved. Please try again." };
  }
  recordAudit({
    actor: adminActor(user),
    category: "products",
    action: "products.saved",
    summary: describeProductChange(before, result.value),
    target: { type: "products", label: "Amounts and terms" },
  });

  // The calculator, quotes, inquiries and investor forms use the new settings immediately.
  updateTag(PRODUCTS_TAG);
  redirect(`${PAGE}?saved=1`);
}

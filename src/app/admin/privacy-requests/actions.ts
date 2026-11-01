"use server";

import { redirect } from "next/navigation";
import { isInvestorIdLike } from "@/components/admin/investors/fields";
import { adminActor } from "@/lib/audit";
import type { Investor } from "@/lib/accounts";
import { parsePrivacyReason } from "@/lib/privacy-requests";
import { AccountError, decidePrivacyRequest, isAccountStorageConfigured } from "@/lib/server/accounts-store";
import { recordAudit } from "@/lib/server/audit-store";
import { requireAdminPermission } from "@/lib/server/auth";

/*
 * Investors' requests for a copy of their data or for their account to be
 * deleted (Master Admin). Fulfilling a request never exports or deletes
 * anything by itself: the admin handles it by hand first (e.g. emails the
 * data, or removes the account using the existing investor tools), then
 * marks it here. Server actions are public endpoints: every action checks
 * the admin's permission first.
 */

const NO_ACCESS = "Your session has ended or you do not have permission for this. Sign in again as a Master Admin.";
const NOT_FOUND = "This request could not be found. Reload the page.";

function investorTarget(investor: Pick<Investor, "id" | "name" | "username">) {
  return { type: "investor" as const, id: investor.id, label: `${investor.name} (${investor.username})` };
}

function isRequestIdLike(id: unknown): id is string {
  return typeof id === "string" && /^prv_[a-f0-9]{12}$/.test(id);
}

export interface DecidePrivacyState {
  status?: "error";
  message?: string;
  fieldError?: string;
}

/** Marks a pending request fulfilled (after handling it manually) or declines it, with an optional reason. */
export async function decidePrivacyRequestAction(_prev: DecidePrivacyState, formData: FormData): Promise<DecidePrivacyState> {
  const admin = await requireAdminPermission("privacy.manage");
  if (!admin) return { status: "error", message: NO_ACCESS };

  const investorId = formData.get("investorId");
  const requestId = formData.get("requestId");
  const decision = formData.get("decision");
  if (!isInvestorIdLike(investorId) || !isRequestIdLike(requestId) || (decision !== "fulfill" && decision !== "decline")) {
    return { status: "error", message: NOT_FOUND };
  }
  const reason = parsePrivacyReason(formData.get("reason"));
  if (!reason.ok) return { status: "error", message: reason.error, fieldError: reason.error };
  if (!isAccountStorageConfigured()) return { status: "error", message: "Account storage is not configured." };

  const fulfill = decision === "fulfill";
  try {
    const { investor, request } = await decidePrivacyRequest(investorId, requestId, {
      outcome: fulfill ? "fulfilled" : "declined",
      reason: reason.value,
      by: admin,
    });
    const what = request.kind === "copy" ? "a copy of their data" : "their account to be deleted";
    recordAudit({
      actor: adminActor(admin),
      category: "privacy",
      action: `investor.privacy_request_${fulfill ? "fulfilled" : "declined"}`,
      summary: `${fulfill ? "Marked as fulfilled" : "Declined"} the request by ${investor.name} (${investor.username}) for ${what}${
        reason.value ? `. Reason: ${reason.value}` : ""
      }`,
      target: investorTarget(investor),
    });
  } catch (error) {
    if (error instanceof AccountError) return { status: "error", message: error.message };
    console.error("Deciding a privacy request failed", error);
    return { status: "error", message: "The request could not be saved. Please try again." };
  }

  redirect(`/admin/privacy-requests?decided=${fulfill ? "fulfilled" : "declined"}`);
}

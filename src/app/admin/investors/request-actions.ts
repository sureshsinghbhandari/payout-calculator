"use server";

import { redirect } from "next/navigation";
import { isInvestorIdLike } from "@/components/admin/investors/fields";
import { adminActor } from "@/lib/audit";
import type { Investor } from "@/lib/accounts";
import { parseReason, type ChangeRequest } from "@/lib/profile-requests";
import { AccountError, decideChangeRequest, getInvestor, isAccountStorageConfigured } from "@/lib/server/accounts-store";
import { recordAudit } from "@/lib/server/audit-store";
import { requireAdminPermission } from "@/lib/server/auth";
import { decryptBankDetails } from "@/lib/server/bank-crypto";

/*
 * Contact and bank detail changes that investors ask for in the portal
 * (Master Admin). Server actions are public endpoints: every action checks
 * the admin's permission first. Full account numbers are never written to
 * the audit log, only their last 4 characters.
 */

const NO_ACCESS = "Your session has ended or you do not have permission for this. Sign in again as a Master Admin.";
const NOT_FOUND = "This request could not be found. Reload the page.";

function investorTarget(investor: Pick<Investor, "id" | "name" | "username">) {
  return { type: "investor" as const, id: investor.id, label: `${investor.name} (${investor.username})` };
}

function isRequestIdLike(id: unknown): id is string {
  return typeof id === "string" && /^chg_[a-f0-9]{12}$/.test(id);
}

/** "email a@x.com → b@y.com, phone (none) → 555 0100" (only what changed). */
function contactChanges(before: Investor, request: ChangeRequest): string {
  if (!request.contact) return "";
  const show = (v: string) => v || "(none)";
  const parts = [
    before.email !== request.contact.email ? `email ${show(before.email)} → ${show(request.contact.email)}` : null,
    before.phone !== request.contact.phone ? `phone ${show(before.phone)} → ${show(request.contact.phone)}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "no changes";
}

export interface DecideState {
  status?: "error";
  message?: string;
  fieldError?: string;
}

/** Approves (and applies) or rejects a pending request, with an optional reason. */
export async function decideChangeRequestAction(_prev: DecideState, formData: FormData): Promise<DecideState> {
  const admin = await requireAdminPermission("investors.manage");
  if (!admin) return { status: "error", message: NO_ACCESS };

  const investorId = formData.get("investorId");
  const requestId = formData.get("requestId");
  const decision = formData.get("decision");
  if (!isInvestorIdLike(investorId) || !isRequestIdLike(requestId) || (decision !== "approve" && decision !== "reject")) {
    return { status: "error", message: NOT_FOUND };
  }
  const reason = parseReason(formData.get("reason"));
  if (!reason.ok) return { status: "error", message: reason.error, fieldError: reason.error };
  if (!isAccountStorageConfigured()) return { status: "error", message: "Account storage is not configured." };

  const approve = decision === "approve";
  const fromList = formData.get("from") === "requests";
  try {
    const { before, investor, request } = await decideChangeRequest(investorId, requestId, {
      approve,
      reason: reason.value,
      by: admin,
    });
    const what =
      request.kind === "contact"
        ? `the contact details change (${contactChanges(before, request)})`
        : `the bank details change (account ending ${request.bank?.accountLast4 ?? "?"})`;
    recordAudit({
      actor: adminActor(admin),
      category: "investor",
      action: `investor.${request.kind}_change_${approve ? "approved" : "rejected"}`,
      summary: `${approve ? "Approved and applied" : "Did not approve"} ${what} requested by investor ${investor.name} (${investor.username})${
        reason.value ? `. Reason: ${reason.value}` : ""
      }`,
      target: investorTarget(investor),
    });
  } catch (error) {
    if (error instanceof AccountError) return { status: "error", message: error.message };
    console.error("Deciding a change request failed", error);
    return { status: "error", message: "The request could not be saved. Please try again." };
  }

  // Back to the page the decision was made on, which confirms it.
  const outcome = approve ? "approved" : "rejected";
  redirect(
    fromList
      ? `/admin/investors/requests?decided=${outcome}`
      : `/admin/investors/${encodeURIComponent(investorId)}?decided=${outcome}#change-requests`,
  );
}

export type RevealResult = { ok: true; accountNumber: string } | { ok: false; error: string };

/**
 * The full account number of an investor's bank details (`requestId` null) or
 * of a pending bank details request (bound on the page). Each look is in the
 * audit log, without the number itself.
 */
export async function revealAccountNumberAction(investorId: string, requestId: string | null): Promise<RevealResult> {
  const admin = await requireAdminPermission("investors.manage");
  if (!admin) return { ok: false, error: NO_ACCESS };
  if (!isInvestorIdLike(investorId) || (requestId !== null && !isRequestIdLike(requestId))) {
    return { ok: false, error: NOT_FOUND };
  }

  let investor: Investor | null;
  try {
    investor = await getInvestor(investorId);
  } catch (error) {
    console.error("Reading investor for bank details failed", error);
    return { ok: false, error: "The bank details could not be loaded. Please try again." };
  }
  if (!investor) return { ok: false, error: NOT_FOUND };

  const encrypted =
    requestId === null
      ? investor.bankDetails?.encrypted
      : investor.changeRequests.find((r) => r.id === requestId && r.status === "pending")?.bank?.encrypted;
  if (!encrypted) return { ok: false, error: NOT_FOUND };
  const details = decryptBankDetails(encrypted, investor.id);
  if (!details) return { ok: false, error: "These bank details could not be read. Ask the investor to send them again." };

  recordAudit({
    actor: adminActor(admin),
    category: "investor",
    action: "investor.bank_number_viewed",
    summary: `Viewed the full account number (ending ${details.accountNumber.slice(-4)}) of ${
      requestId === null ? "the bank details" : "a requested bank details change"
    } of investor ${investor.name} (${investor.username})`,
    target: investorTarget(investor),
  });
  return { ok: true, accountNumber: details.accountNumber };
}

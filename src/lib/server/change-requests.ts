import "server-only";
import type { Investor } from "../accounts";
import {
  maskBankDetails,
  sortRequests,
  type BankDetailsView,
  type ChangeRequest,
  type ChangeRequestView,
} from "../profile-requests";
import { decryptBankDetails } from "./bank-crypto";

/**
 * Change requests and bank details prepared for display: decrypted on the
 * server and masked (never the full account number), so they are safe to
 * pass to client components. The full number is only revealed on request
 * (revealAccountNumberAction, Master Admins).
 */

export function bankDetailsView(investor: Pick<Investor, "id" | "bankDetails">): BankDetailsView {
  const stored = investor.bankDetails;
  if (!stored) return { state: "none" };
  const details = decryptBankDetails(stored.encrypted, investor.id);
  return details
    ? { state: "ok", details: maskBankDetails(details), updatedAt: stored.updatedAt }
    : { state: "unreadable", accountLast4: stored.accountLast4, updatedAt: stored.updatedAt };
}

export function changeRequestView(request: ChangeRequest, investorId: string): ChangeRequestView {
  const decrypted = request.bank?.encrypted ? decryptBankDetails(request.bank.encrypted, investorId) : null;
  return {
    id: request.id,
    kind: request.kind,
    status: request.status,
    requestedAt: request.requestedAt,
    decidedAt: request.decidedAt,
    decidedBy: request.decidedBy,
    reason: request.reason,
    contact: request.contact ? { ...request.contact } : null,
    bank: decrypted ? maskBankDetails(decrypted) : null,
    bankLast4: request.bank?.accountLast4 ?? null,
  };
}

/** An investor's requests, newest first. */
export function changeRequestViews(investor: Pick<Investor, "id" | "changeRequests">): ChangeRequestView[] {
  return sortRequests(investor.changeRequests).map((r) => changeRequestView(r, investor.id));
}

export function pendingCount(investors: readonly Pick<Investor, "changeRequests">[]): number {
  return investors.reduce((sum, i) => sum + i.changeRequests.filter((r) => r.status === "pending").length, 0);
}

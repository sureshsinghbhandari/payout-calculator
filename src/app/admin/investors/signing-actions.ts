"use server";

import { refresh } from "next/cache";
import { isInvestorIdLike } from "@/components/admin/investors/fields";
import { adminActor } from "@/lib/audit";
import { latestPaidOn } from "@/lib/investments";
import { findSigningItem, parseSentDate } from "@/lib/signing";
import { todayEastern } from "@/lib/time";
import { getInvestor, isAccountStorageConfigured } from "@/lib/server/accounts-store";
import { recordAudit } from "@/lib/server/audit-store";
import { requireAdminPermission } from "@/lib/server/auth";
import { DocumentError, isDocumentStorageConfigured, recordSent } from "@/lib/server/documents-store";
import { formatIsoDate } from "@/lib/format";

/*
 * Signing (Master Admin). The PDF is made by GET /admin/investors/<id>/signing/<item> and the signed file is
 * added with registerDocumentAction (document-actions.ts); this file holds the one step the app cannot see: the
 * owner saying "I sent it in BoldSign". Server actions are public endpoints: every action checks permission first.
 */

const NO_ACCESS = "Your session has ended or you do not have permission for this. Sign in again as a Master Admin.";
const NOT_FOUND = "This document could not be found. Reload the page.";

export interface SigningActionResult {
  ok: boolean;
  message: string;
  fieldError?: string;
}

/** Marks a signing document as sent in BoldSign on `sentOn` (YYYY-MM-DD), or with null takes the mark off. */
export async function markSentAction(investorId: string, itemKey: string, sentOn: string | null): Promise<SigningActionResult> {
  const admin = await requireAdminPermission("investors.manage");
  if (!admin) return { ok: false, message: NO_ACCESS };
  if (!isInvestorIdLike(investorId)) return { ok: false, message: NOT_FOUND };
  if (!isAccountStorageConfigured() || !isDocumentStorageConfigured()) {
    return { ok: false, message: "Storage is not connected, so this cannot be saved." };
  }

  let date: string | null = null;
  if (sentOn !== null) {
    const parsed = parseSentDate(sentOn, latestPaidOn(todayEastern()));
    if (!parsed.ok) return { ok: false, message: "Fix the date.", fieldError: parsed.error };
    date = parsed.value;
  }

  try {
    const investor = await getInvestor(investorId);
    const item = investor ? findSigningItem(investor, itemKey) : null;
    if (!investor || !item) return { ok: false, message: NOT_FOUND };
    await recordSent(investor.id, item.key, date, admin.name);
    recordAudit({
      actor: adminActor(admin),
      category: "investor",
      action: date ? "investor.signing_sent" : "investor.signing_sent_cleared",
      summary: date
        ? `Marked "${item.title}" as sent for signature on ${formatIsoDate(date)} for investor ${investor.name} (${investor.username})`
        : `Cleared the sent-for-signature mark of "${item.title}" for investor ${investor.name} (${investor.username})`,
      target: { type: "investor", id: investor.id, label: `${investor.name} (${investor.username})` },
    });
  } catch (error) {
    if (error instanceof DocumentError) return { ok: false, message: error.message };
    console.error("Saving the sent date of a signing document failed", error);
    return { ok: false, message: "This could not be saved. Please try again." };
  }

  refresh();
  return { ok: true, message: date ? `Marked as sent on ${formatIsoDate(date)}.` : "The sent mark was removed." };
}

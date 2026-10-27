"use server";

import { refresh } from "next/cache";
import { investorActor } from "@/lib/audit";
import { AccountError, setInvestorPayoutEmails } from "@/lib/server/accounts-store";
import { recordAudit } from "@/lib/server/audit-store";
import { getCurrentInvestor } from "@/lib/server/auth";

export interface PayoutEmailsState {
  status?: "saved" | "error";
  message?: string;
}

/** Switches the signed-in investor's payout emails (reminders and payment confirmations) on or off. */
export async function setPayoutEmailsAction(_prev: PayoutEmailsState, formData: FormData): Promise<PayoutEmailsState> {
  const investor = await getCurrentInvestor();
  if (!investor || investor.mustChangePassword) return { status: "error", message: "Your session has ended. Sign in again." };
  const choice = formData.get("payoutEmails");
  if (choice !== "on" && choice !== "off") return { status: "error", message: "Something went wrong. Reload the page and try again." };
  const on = choice === "on";

  try {
    const updated = await setInvestorPayoutEmails(investor.id, on);
    recordAudit({
      actor: investorActor(updated),
      category: "investor",
      action: on ? "investor.payout_emails_on" : "investor.payout_emails_off",
      summary: `Switched payout emails ${on ? "on" : "off"} in the investor portal`,
      target: { type: "investor", id: updated.id, label: `${updated.name} (${updated.username})` },
    });
  } catch (error) {
    if (!(error instanceof AccountError)) console.error("Changing payout emails failed", error);
    return { status: "error", message: "Your choice could not be saved. Please try again." };
  }

  refresh();
  return {
    status: "saved",
    message: on ? "Payout emails are on." : "Payout emails are off. You can switch them on again here at any time.",
  };
}

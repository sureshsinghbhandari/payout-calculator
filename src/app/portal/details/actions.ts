"use server";

import { redirect } from "next/navigation";
import { investorActor } from "@/lib/audit";
import type { Investor } from "@/lib/accounts";
import {
  accountLast4,
  parseBankDetails,
  parseContactChange,
  type BankField,
  type ContactChangeField,
} from "@/lib/profile-requests";
import {
  AccountError,
  addChangeRequest,
  isAccountStorageConfigured,
  withdrawChangeRequest,
} from "@/lib/server/accounts-store";
import { recordAudit } from "@/lib/server/audit-store";
import { getCurrentInvestor } from "@/lib/server/auth";
import { encryptBankDetails, isBankEncryptionAvailable } from "@/lib/server/bank-crypto";

/*
 * Investor portal: ask for changes to contact and bank details. Requests wait
 * for a Master Admin to approve them. Server actions are public endpoints:
 * every action checks the investor's session itself. Bank details are
 * encrypted before they are stored, and the audit log only ever gets the last
 * 4 characters of an account number.
 */

const DETAILS = "/portal/details";
const SESSION_ENDED = "Your session has ended. Sign in again.";
/** Longest value echoed back into a form after an error. */
const ECHO_MAX = 100;

async function signedInInvestor(): Promise<Investor | null> {
  try {
    const investor = await getCurrentInvestor();
    return investor && !investor.mustChangePassword ? investor : null;
  } catch (error) {
    console.error("Loading investor for a change request failed", error);
    return null;
  }
}

function target(investor: Pick<Investor, "id" | "name" | "username">) {
  return { type: "investor" as const, id: investor.id, label: `${investor.name} (${investor.username})` };
}

function readValues<F extends string>(formData: FormData, fields: readonly F[]): Record<F, string> {
  const values = {} as Record<F, string>;
  for (const name of fields) {
    const value = formData.get(name);
    values[name] = typeof value === "string" ? value.slice(0, ECHO_MAX) : "";
  }
  return values;
}

export interface ChangeRequestState<F extends string> {
  attempt?: number;
  status?: "error";
  message?: string;
  fieldErrors?: Partial<Record<F, string>>;
  values?: Partial<Record<F, string>>;
}

const CONTACT_FIELDS = ["email", "phone"] as const;

export async function requestContactChangeAction(
  prev: ChangeRequestState<ContactChangeField>,
  formData: FormData,
): Promise<ChangeRequestState<ContactChangeField>> {
  const attempt = (prev.attempt ?? 0) + 1;
  const investor = await signedInInvestor();
  if (!investor) return { attempt, status: "error", message: SESSION_ENDED };

  const values = readValues(formData, CONTACT_FIELDS);
  const parsed = parseContactChange(values);
  if (!parsed.ok) return { attempt, status: "error", message: "Check the highlighted fields.", fieldErrors: parsed.errors, values };
  if (parsed.value.email === investor.email.toLowerCase() && parsed.value.phone === investor.phone) {
    return { attempt, status: "error", message: "These are already your details. Change something to send a request.", values };
  }
  if (!isAccountStorageConfigured()) return { attempt, status: "error", message: "This is not available right now.", values };

  try {
    await addChangeRequest(investor.id, { kind: "contact", contact: parsed.value, bank: null });
  } catch (error) {
    if (error instanceof AccountError) return { attempt, status: "error", message: error.message, values };
    console.error("Saving a contact details request failed", error);
    return { attempt, status: "error", message: "Your request could not be sent. Please try again.", values };
  }

  recordAudit({
    actor: investorActor(investor),
    category: "investor",
    action: "investor.contact_change_requested",
    summary: `Asked to change their contact details to email ${parsed.value.email}, phone ${parsed.value.phone || "(none)"}`,
    target: target(investor),
  });
  redirect(`${DETAILS}?sent=contact`);
}

const BANK_FIELDS = ["accountHolder", "bankName", "routingCode", "accountNumber"] as const;

export async function requestBankChangeAction(
  prev: ChangeRequestState<BankField>,
  formData: FormData,
): Promise<ChangeRequestState<BankField>> {
  const attempt = (prev.attempt ?? 0) + 1;
  const investor = await signedInInvestor();
  if (!investor) return { attempt, status: "error", message: SESSION_ENDED };

  const values = readValues(formData, BANK_FIELDS);
  // The account number is never sent back to the browser.
  const echo = { ...values, accountNumber: "" };
  const parsed = parseBankDetails(values);
  if (!parsed.ok) {
    return { attempt, status: "error", message: "Check the highlighted fields.", fieldErrors: parsed.errors, values: echo };
  }
  if (!isAccountStorageConfigured() || !isBankEncryptionAvailable()) {
    return { attempt, status: "error", message: "This is not available right now. Please contact us.", values: echo };
  }

  const last4 = accountLast4(parsed.value.accountNumber);
  try {
    const encrypted = encryptBankDetails(parsed.value, investor.id);
    await addChangeRequest(investor.id, { kind: "bank", contact: null, bank: { encrypted, accountLast4: last4 } });
  } catch (error) {
    if (error instanceof AccountError) return { attempt, status: "error", message: error.message, values: echo };
    console.error("Saving a bank details request failed", error);
    return { attempt, status: "error", message: "Your request could not be sent. Please try again.", values: echo };
  }

  recordAudit({
    actor: investorActor(investor),
    category: "investor",
    action: "investor.bank_change_requested",
    summary: `Asked to change their bank details to ${parsed.value.bankName}, account ending ${last4}`,
    target: target(investor),
  });
  redirect(`${DETAILS}?sent=bank`);
}

export interface WithdrawState {
  status?: "error";
  message?: string;
}

/** Withdraws one of the investor's own pending requests. */
export async function withdrawChangeRequestAction(_prev: WithdrawState, formData: FormData): Promise<WithdrawState> {
  const investor = await signedInInvestor();
  if (!investor) return { status: "error", message: SESSION_ENDED };
  const requestId = formData.get("requestId");
  // Only this investor's own requests are found.
  const own = typeof requestId === "string" ? investor.changeRequests.find((r) => r.id === requestId) : undefined;
  if (!own) return { status: "error", message: "This request could not be found. Reload the page." };

  try {
    const { request } = await withdrawChangeRequest(investor.id, own.id);
    recordAudit({
      actor: investorActor(investor),
      category: "investor",
      action: `investor.${request.kind}_change_withdrawn`,
      summary: `Withdrew their request to change their ${request.kind === "bank" ? "bank" : "contact"} details`,
      target: target(investor),
    });
  } catch (error) {
    if (error instanceof AccountError) return { status: "error", message: error.message };
    console.error("Withdrawing a change request failed", error);
    return { status: "error", message: "The request could not be withdrawn. Please try again." };
  }
  redirect(`${DETAILS}?withdrawn=1`);
}

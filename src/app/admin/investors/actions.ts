"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  CONTACT_FIELDS,
  CONVERT_FIELDS,
  isInvestorIdLike,
  parseContactFields,
  parsePlanFields,
  readFields,
  type ContactField,
  type ConvertField,
  type FieldErrors,
} from "@/components/admin/investors/fields";
import { FREQUENCY_LABELS, validateRate } from "@/lib/payout";
import {
  AccountError,
  createInvestor,
  getInvestor,
  isAccountStorageConfigured,
  issueInvestorSetupToken,
  setInvestorPassword,
  updateInvestor,
} from "@/lib/server/accounts-store";
import { requireAdminPermission } from "@/lib/server/auth";
import { recordAudit } from "@/lib/server/audit-store";
import { adminActor } from "@/lib/audit";
import { inquiryReference, isInquiryId } from "@/lib/inquiry";
import { formatDollars } from "@/lib/format";
import type { Investor } from "@/lib/accounts";
import { getInquiry, markInquiryConverted } from "@/lib/server/inquiry-store";
import { hashPassword, validateNewPassword } from "@/lib/server/passwords";
import { getCurrentRates } from "@/lib/server/rates-store";

/*
 * Investors administration (Master Admin only). Server actions are public
 * endpoints: every action checks the admin's permission first and validates
 * every field again on the server.
 */

const NO_ACCESS = "Your session has ended or you do not have permission for this. Sign in again as a Master Admin.";
const NO_STORAGE = "Account storage is not configured, so investors cannot be saved.";
const NOT_FOUND = "This investor could not be found. Reload the page.";

function errorMessage(error: unknown, fallback: string, context: string): string {
  if (error instanceof AccountError) return error.message;
  console.error(context, error);
  return fallback;
}

// ---------- convert an inquiry into an investor ----------


function investorTarget(investor: Pick<Investor, "id" | "name" | "username">) {
  return { type: "investor" as const, id: investor.id, label: `${investor.name} (${investor.username})` };
}

export interface ConvertState {
  /** Increases with every submission, so the form shows the returned values. */
  attempt?: number;
  error?: string;
  fieldErrors?: FieldErrors<ConvertField>;
  values?: Partial<Record<ConvertField, string>>;
}

export async function convertInquiryAction(prev: ConvertState, formData: FormData): Promise<ConvertState> {
  const attempt = (prev.attempt ?? 0) + 1;
  const admin = await requireAdminPermission("inquiries.convert");
  if (!admin) return { attempt, error: NO_ACCESS };

  const values = readFields(formData, CONVERT_FIELDS);
  const inquiryId = formData.get("inquiryId");
  if (typeof inquiryId !== "string" || !isInquiryId(inquiryId)) {
    return { attempt, values, error: "This inquiry could not be found." };
  }
  if (!isAccountStorageConfigured()) return { attempt, values, error: NO_STORAGE };

  // Re-read the inquiry: only a contacted inquiry can be converted.
  let inquiry: Awaited<ReturnType<typeof getInquiry>>;
  try {
    inquiry = await getInquiry(inquiryId);
  } catch (error) {
    console.error("Reading inquiry for conversion failed", error);
    return { attempt, values, error: "The inquiry could not be loaded. Please try again." };
  }
  if (!inquiry) return { attempt, values, error: "This inquiry could not be found." };
  if (inquiry.status !== "contacted") {
    return {
      attempt,
      values,
      error:
        inquiry.status === "converted"
          ? "This inquiry has already been converted to an investor."
          : "Only inquiries marked as contacted can be converted.",
    };
  }

  const contact = parseContactFields(values);
  const plan = parsePlanFields(values);
  if (!contact.ok || !plan.ok) {
    return {
      attempt,
      values,
      error: "Fix the highlighted fields.",
      fieldErrors: { ...(contact.ok ? {} : contact.errors), ...(plan.ok ? {} : plan.errors) },
    };
  }

  // The rate in effect now for the chosen payout term is fixed on the investment.
  let annualRatePercent: number;
  try {
    const rate = validateRate((await getCurrentRates())[plan.value.frequency]);
    if (!rate.ok) {
      return {
        attempt,
        values,
        error: `The current ${FREQUENCY_LABELS[plan.value.frequency]} rate is not valid. Check Interest rates in Settings.`,
      };
    }
    annualRatePercent = rate.value;
  } catch (error) {
    console.error("Reading rates for conversion failed", error);
    return { attempt, values, error: "The current interest rates could not be loaded. Please try again." };
  }

  let investorId: string;
  try {
    const investor = await createInvestor({
      ...contact.value,
      sourceInquiryId: inquiry.id,
      investment: { ...plan.value, annualRatePercent },
    });
    investorId = investor.id;
    recordAudit({
      actor: adminActor(admin),
      category: "investor",
      action: "investor.created",
      summary: `Converted inquiry ${inquiryReference(inquiry.id)} into investor ${investor.name} (${investor.username}), ${formatDollars(plan.value.principal)}`,
      target: investorTarget(investor),
    });
  } catch (error) {
    const message = errorMessage(error, "The investor could not be created. Please try again.", "Creating investor failed");
    const usernameTaken = error instanceof AccountError && /username/i.test(error.message);
    return { attempt, values, error: message, ...(usernameTaken ? { fieldErrors: { username: message } } : {}) };
  }

  try {
    const marked = await markInquiryConverted(inquiry.id, investorId, new Date().toISOString());
    if (!marked) console.error("Inquiry was not marked as converted", inquiry.id, investorId);
    else {
      // Also on the inquiry's own activity (the event above is about the investor).
      recordAudit({
        actor: adminActor(admin),
        category: "inquiry",
        action: "inquiry.converted",
        summary: `Marked inquiry ${inquiryReference(inquiry.id)} (${inquiry.name}) as converted to an investor`,
        target: { type: "inquiry", id: inquiry.id, label: `${inquiryReference(inquiry.id)} (${inquiry.name})` },
      });
    }
  } catch (error) {
    // The investor exists; converting the same inquiry again is refused by the store.
    console.error("Marking inquiry as converted failed", inquiry.id, investorId, error);
  }

  redirect(`/admin/investors/${encodeURIComponent(investorId)}?created=1`);
}

// ---------- contact details ----------

export interface InvestorDetailsState {
  attempt?: number;
  status?: "saved" | "error";
  message?: string;
  fieldErrors?: FieldErrors<ContactField>;
  values?: Partial<Record<ContactField, string>>;
}

export async function updateInvestorDetailsAction(
  prev: InvestorDetailsState,
  formData: FormData,
): Promise<InvestorDetailsState> {
  const attempt = (prev.attempt ?? 0) + 1;
  const admin = await requireAdminPermission("investors.manage");
  if (!admin) return { attempt, status: "error", message: NO_ACCESS };

  const values = readFields(formData, CONTACT_FIELDS);
  const id = formData.get("id");
  if (!isInvestorIdLike(id)) return { attempt, status: "error", message: NOT_FOUND, values };
  if (!isAccountStorageConfigured()) return { attempt, status: "error", message: NO_STORAGE, values };

  const contact = parseContactFields(values);
  if (!contact.ok) {
    return { attempt, status: "error", message: "Fix the highlighted fields.", fieldErrors: contact.errors, values };
  }

  try {
    const updated = await updateInvestor(id, contact.value);
    recordAudit({
      actor: adminActor(admin),
      category: "investor",
      action: "investor.details_updated",
      summary: `Updated contact details of investor ${updated.name} (${updated.username})`,
      target: investorTarget(updated),
    });
  } catch (error) {
    const message = errorMessage(error, "The details could not be saved. Please try again.", "Updating investor failed");
    const usernameTaken = error instanceof AccountError && /username/i.test(error.message);
    return { attempt, status: "error", message, values, ...(usernameTaken ? { fieldErrors: { username: message } } : {}) };
  }

  refresh();
  return { attempt, status: "saved", message: "Contact details saved." };
}

// ---------- login access ----------

export interface InvestorActionState {
  status?: "saved" | "error";
  message?: string;
}

export async function setInvestorAccessAction(
  _prev: InvestorActionState,
  formData: FormData,
): Promise<InvestorActionState> {
  const admin = await requireAdminPermission("investors.manage");
  if (!admin) return { status: "error", message: NO_ACCESS };

  const id = formData.get("id");
  const active = formData.get("active");
  if (!isInvestorIdLike(id) || (active !== "true" && active !== "false")) {
    return { status: "error", message: NOT_FOUND };
  }
  if (!isAccountStorageConfigured()) return { status: "error", message: NO_STORAGE };

  try {
    const updated = await updateInvestor(id, { active: active === "true" });
    recordAudit({
      actor: adminActor(admin),
      category: "investor",
      action: updated.active ? "investor.login_enabled" : "investor.login_disabled",
      summary: `${updated.active ? "Enabled" : "Disabled"} login for investor ${updated.name} (${updated.username})`,
      target: investorTarget(updated),
    });
  } catch (error) {
    return {
      status: "error",
      message: errorMessage(error, "Login access could not be changed. Please try again.", "Changing investor access failed"),
    };
  }

  refresh();
  return {
    status: "saved",
    message: active === "true" ? "Login enabled." : "Login disabled. The investor is signed out and cannot sign in.",
  };
}

// ---------- temporary password ----------

export interface TemporaryPasswordState {
  status?: "saved" | "error";
  message?: string;
  /** Error for the password fields (never the password itself). */
  fieldError?: string;
}

export async function setInvestorTemporaryPasswordAction(
  _prev: TemporaryPasswordState,
  formData: FormData,
): Promise<TemporaryPasswordState> {
  const admin = await requireAdminPermission("investors.manage");
  if (!admin) return { status: "error", message: NO_ACCESS };

  const id = formData.get("id");
  const password = formData.get("password");
  const confirm = formData.get("confirm");
  if (!isInvestorIdLike(id)) return { status: "error", message: NOT_FOUND };
  if (typeof password !== "string" || typeof confirm !== "string") {
    return { status: "error", message: "Enter the temporary password twice.", fieldError: "Enter the temporary password twice." };
  }
  const invalid = validateNewPassword(password, confirm);
  if (invalid) return { status: "error", message: invalid, fieldError: invalid };
  if (!isAccountStorageConfigured()) return { status: "error", message: NO_STORAGE };

  try {
    const updated = await setInvestorPassword(id, await hashPassword(password), true);
    recordAudit({
      actor: adminActor(admin),
      category: "investor",
      action: "investor.temporary_password",
      summary: `Set a temporary password for investor ${updated.name} (${updated.username})`,
      target: investorTarget(updated),
    });
  } catch (error) {
    return {
      status: "error",
      message: errorMessage(error, "The password could not be set. Please try again.", "Setting investor password failed"),
    };
  }

  refresh();
  return {
    status: "saved",
    message:
      "Temporary password set. Share it with the investor securely. They must choose a new password when they next sign in.",
  };
}

// ---------- setup link ----------

export interface SetupLinkState {
  status?: "created" | "error";
  message?: string;
  /** One-time token, returned once to the Master Admin; only its hash is stored. */
  token?: string;
}

export async function createInvestorSetupLinkAction(_prev: SetupLinkState, formData: FormData): Promise<SetupLinkState> {
  const admin = await requireAdminPermission("investors.manage");
  if (!admin) return { status: "error", message: NO_ACCESS };

  const id = formData.get("id");
  if (!isInvestorIdLike(id)) return { status: "error", message: NOT_FOUND };
  if (!isAccountStorageConfigured()) return { status: "error", message: NO_STORAGE };

  let token: string;
  try {
    token = await issueInvestorSetupToken(id);
    const investor = await getInvestor(id);
    if (investor) {
      recordAudit({
        actor: adminActor(admin),
        category: "investor",
        action: "investor.setup_link",
        summary: `Created a setup link for investor ${investor.name} (${investor.username})`,
        target: investorTarget(investor),
      });
    }
  } catch (error) {
    return {
      status: "error",
      message: errorMessage(error, "The setup link could not be created. Please try again.", "Creating setup link failed"),
    };
  }

  refresh();
  return { status: "created", token };
}

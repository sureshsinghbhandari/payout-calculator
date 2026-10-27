"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  CONTACT_FIELDS,
  CONVERT_FIELDS,
  isInvestorIdLike,
  parseContactFields,
  parsePaymentFields,
  parsePlanFields,
  PAYMENT_FIELDS,
  PLAN_FIELDS,
  readFields,
  type ContactField,
  type ConvertField,
  type FieldErrors,
  type PaymentField,
  type PlanField,
} from "@/components/admin/investors/fields";
import { FREQUENCY_LABELS, PERIODS_PER_YEAR, validateRate, type PayoutRow } from "@/lib/payout";
import {
  AccountError,
  addInvestment,
  createInvestor,
  getInvestor,
  isAccountStorageConfigured,
  issueInvestorSetupToken,
  removePayoutPayment,
  setInvestorPassword,
  setPayoutPayment,
  updateInvestor,
} from "@/lib/server/accounts-store";
import { requireAdminPermission } from "@/lib/server/auth";
import { recordAudit } from "@/lib/server/audit-store";
import { adminActor } from "@/lib/audit";
import { inquiryReference, isInquiryId } from "@/lib/inquiry";
import { formatCents, formatDollars, formatIsoDate } from "@/lib/format";
import { hasTwoStep, type Investment, type Investor, type PayoutPayment } from "@/lib/accounts";
import { isMatured, latestPaidOn, renewalOf, scheduleOrNull, todayUtc } from "@/lib/investments";
import { buildStatementData, type StatementResult } from "@/lib/statement";
import { getInquiry, markInquiryConverted } from "@/lib/server/inquiry-store";
import { hashPassword, validateNewPassword } from "@/lib/server/passwords";
import { turnOffTwoStep } from "@/lib/server/two-step";
import type { TwoStepResetState } from "@/lib/two-step";
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

// ---------- two-step sign-in ----------

/** Resets an investor's two-step sign-in, e.g. when they lost their phone. They then sign in with their password only. */
export async function resetInvestorTwoStepAction(_prev: TwoStepResetState, formData: FormData): Promise<TwoStepResetState> {
  const admin = await requireAdminPermission("investors.manage");
  if (!admin) return { status: "error", message: NO_ACCESS };

  const id = formData.get("id");
  if (!isInvestorIdLike(id)) return { status: "error", message: NOT_FOUND };
  if (!isAccountStorageConfigured()) return { status: "error", message: NO_STORAGE };

  try {
    const investor = await getInvestor(id);
    if (!investor) return { status: "error", message: NOT_FOUND };
    if (!hasTwoStep(investor)) return { status: "ok", message: "Two-step sign-in is already off." };
    await turnOffTwoStep("investor", id);
    recordAudit({
      actor: adminActor(admin),
      category: "investor",
      action: "investor.two_step_reset",
      summary: `Reset two-step sign-in for investor ${investor.name} (${investor.username})`,
      target: investorTarget(investor),
    });
  } catch (error) {
    return {
      status: "error",
      message: errorMessage(error, "Two-step sign-in could not be reset. Please try again.", "Resetting investor two-step sign-in failed"),
    };
  }

  refresh();
  return {
    status: "ok",
    message: "Two-step sign-in reset. The investor can sign in with their password only, and set it up again under Sign-in security.",
  };
}

// ---------- more investments and renewals ----------

/** "the $100,000 investment of Jan 5, 2026" */
function investmentLabel(investment: Pick<Investment, "principal" | "investmentDate">): string {
  return `the ${formatDollars(investment.principal)} investment of ${formatIsoDate(investment.investmentDate)}`;
}

export interface AddInvestmentState {
  attempt?: number;
  error?: string;
  fieldErrors?: FieldErrors<PlanField>;
  values?: Partial<Record<PlanField, string>>;
}

/**
 * Adds an investment to an existing investor, or renews a matured one
 * (`renewedFromId`). Like a conversion, the current rate for the chosen payout
 * term is fixed on the new investment.
 */
export async function addInvestmentAction(prev: AddInvestmentState, formData: FormData): Promise<AddInvestmentState> {
  const attempt = (prev.attempt ?? 0) + 1;
  const admin = await requireAdminPermission("investors.manage");
  if (!admin) return { attempt, error: NO_ACCESS };

  const values = readFields(formData, PLAN_FIELDS);
  const id = formData.get("id");
  const renewedRaw = formData.get("renewedFromId");
  const renewedFromId = typeof renewedRaw === "string" && renewedRaw !== "" ? renewedRaw : null;
  if (!isInvestorIdLike(id) || (renewedFromId !== null && !isInvestorIdLike(renewedFromId))) {
    return { attempt, values, error: NOT_FOUND };
  }
  if (!isAccountStorageConfigured()) return { attempt, values, error: NO_STORAGE };

  const plan = parsePlanFields(values);
  if (!plan.ok) return { attempt, values, error: "Fix the highlighted fields.", fieldErrors: plan.errors };

  let investor: Investor | null;
  try {
    investor = await getInvestor(id);
  } catch (error) {
    console.error("Reading investor for a new investment failed", error);
    return { attempt, values, error: "The investor could not be loaded. Please try again." };
  }
  if (!investor) return { attempt, values, error: NOT_FOUND };

  // A renewal needs a matured investment of this investor that has not been renewed yet.
  const source = renewedFromId ? investor.investments.find((i) => i.id === renewedFromId) : undefined;
  if (renewedFromId) {
    if (!source) return { attempt, values, error: "The investment to renew could not be found. Reload the page." };
    const sourceSchedule = scheduleOrNull(source);
    if (!sourceSchedule || !isMatured(sourceSchedule, todayUtc())) {
      return { attempt, values, error: "Only an investment whose term has ended can be renewed." };
    }
    if (renewalOf(source, investor.investments)) {
      return { attempt, values, error: "This investment has already been renewed." };
    }
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
    console.error("Reading rates for a new investment failed", error);
    return { attempt, values, error: "The current interest rates could not be loaded. Please try again." };
  }

  try {
    const { investor: updated, investment } = await addInvestment(id, {
      ...plan.value,
      annualRatePercent,
      renewedFromId,
    });
    recordAudit({
      actor: adminActor(admin),
      category: "investor",
      action: source ? "investor.investment_renewed" : "investor.investment_added",
      summary: source
        ? `Renewed ${investmentLabel(source)} of investor ${updated.name} (${updated.username}) as ${investmentLabel(investment)}`
        : `Added ${investmentLabel(investment)} for investor ${updated.name} (${updated.username})`,
      target: investorTarget(updated),
    });
  } catch (error) {
    return {
      attempt,
      values,
      error: errorMessage(error, "The investment could not be saved. Please try again.", "Adding investment failed"),
    };
  }

  redirect(`/admin/investors/${encodeURIComponent(id)}?${source ? "renewed" : "added"}=1`);
}

// ---------- recorded payouts ----------

export interface PaymentState {
  attempt?: number;
  status?: "saved" | "error";
  message?: string;
  fieldErrors?: FieldErrors<PaymentField>;
  values?: Partial<Record<PaymentField, string>>;
}

/** The investor, investment and scheduled payout named by a payment form, or an error message. */
async function findPayout(
  formData: FormData,
): Promise<{ investor: Investor; investment: Investment; row: PayoutRow } | { error: string }> {
  const investorId = formData.get("investorId");
  const investmentId = formData.get("investmentId");
  const payoutText = formData.get("payoutNumber");
  if (!isInvestorIdLike(investorId) || !isInvestorIdLike(investmentId)) return { error: NOT_FOUND };
  if (typeof payoutText !== "string" || !/^\d{1,4}$/.test(payoutText)) return { error: NOT_FOUND };
  if (!isAccountStorageConfigured()) return { error: NO_STORAGE };

  let investor: Investor | null;
  try {
    investor = await getInvestor(investorId);
  } catch (error) {
    console.error("Reading investor for a payment failed", error);
    return { error: "The investor could not be loaded. Please try again." };
  }
  const investment = investor?.investments.find((i) => i.id === investmentId);
  const schedule = investment ? scheduleOrNull(investment) : null;
  const row = schedule?.rows.find((r) => r.payoutNumber === Number(payoutText));
  if (!investor || !investment || !row) return { error: "This payout could not be found. Reload the page." };
  return { investor, investment, row };
}

/** "payout 3 of 8 (scheduled Jan 5, 2027) of the $100,000 investment of Jan 5, 2026" */
function payoutLabel(investment: Investment, row: PayoutRow): string {
  const total = investment.lockInYears * PERIODS_PER_YEAR[investment.frequency];
  return `payout ${row.payoutNumber} of ${total} (scheduled ${formatIsoDate(row.payoutDate)}) of ${investmentLabel(investment)}`;
}

/** Marks a scheduled payout as paid, or changes the recorded payment. */
export async function recordPaymentAction(prev: PaymentState, formData: FormData): Promise<PaymentState> {
  const attempt = (prev.attempt ?? 0) + 1;
  const admin = await requireAdminPermission("payouts.manage");
  if (!admin) return { attempt, status: "error", message: NO_ACCESS };

  const values = readFields(formData, PAYMENT_FIELDS);
  const found = await findPayout(formData);
  if ("error" in found) return { attempt, status: "error", message: found.error, values };
  const { investor, investment, row } = found;

  const parsed = parsePaymentFields(values, {
    earliest: investment.investmentDate,
    latest: latestPaidOn(todayUtc()),
  });
  if (!parsed.ok) {
    return { attempt, status: "error", message: "Fix the highlighted fields.", fieldErrors: parsed.errors, values };
  }
  const payment: PayoutPayment = {
    payoutNumber: row.payoutNumber,
    ...parsed.value,
    recordedBy: admin.name,
    recordedById: admin.id,
    recordedAt: new Date().toISOString(),
  };

  try {
    const { investor: updated, previous } = await setPayoutPayment(investor.id, investment.id, payment);
    const paid = `${formatCents(payment.amountCents)} on ${formatIsoDate(payment.paidOn)}${
      payment.reference ? `, reference ${payment.reference}` : ""
    }`;
    recordAudit({
      actor: adminActor(admin),
      category: "investor",
      action: previous ? "investor.payout_updated" : "investor.payout_recorded",
      summary: previous
        ? `Changed the recorded payment of ${payoutLabel(investment, row)} of investor ${updated.name} (${updated.username}) to ${paid} (was ${formatCents(previous.amountCents)} on ${formatIsoDate(previous.paidOn)})`
        : `Marked ${payoutLabel(investment, row)} of investor ${updated.name} (${updated.username}) as paid: ${paid}`,
      target: investorTarget(updated),
    });
  } catch (error) {
    return {
      attempt,
      status: "error",
      message: errorMessage(error, "The payment could not be saved. Please try again.", "Recording payment failed"),
      values,
    };
  }

  refresh();
  return { attempt, status: "saved", message: `Payout ${row.payoutNumber} marked as paid.` };
}

/** Removes the recorded payment of a payout, so it shows as Due or Upcoming again. */
export async function removePaymentAction(prev: PaymentState, formData: FormData): Promise<PaymentState> {
  const attempt = (prev.attempt ?? 0) + 1;
  const admin = await requireAdminPermission("payouts.manage");
  if (!admin) return { attempt, status: "error", message: NO_ACCESS };

  const found = await findPayout(formData);
  if ("error" in found) return { attempt, status: "error", message: found.error };
  const { investor, investment, row } = found;

  try {
    const { investor: updated, removed } = await removePayoutPayment(investor.id, investment.id, row.payoutNumber);
    if (removed) {
      recordAudit({
        actor: adminActor(admin),
        category: "investor",
        action: "investor.payout_unmarked",
        summary: `Removed the recorded payment of ${payoutLabel(investment, row)} of investor ${updated.name} (${updated.username}) (was ${formatCents(removed.amountCents)} on ${formatIsoDate(removed.paidOn)})`,
        target: investorTarget(updated),
      });
    }
  } catch (error) {
    return {
      attempt,
      status: "error",
      message: errorMessage(error, "The payment could not be removed. Please try again.", "Removing payment failed"),
    };
  }

  refresh();
  return { attempt, status: "saved", message: `Payout ${row.payoutNumber} is no longer marked as paid.` };
}

// ---------- statement download ----------

/** Statement data for one investment (bound to the ids on the investor page). Includes the rate: admins only. */
export async function adminStatementAction(investorId: string, investmentId: string): Promise<StatementResult> {
  const admin = await requireAdminPermission("investors.manage");
  if (!admin) return { ok: false, error: NO_ACCESS };
  if (!isInvestorIdLike(investorId) || !isInvestorIdLike(investmentId)) return { ok: false, error: NOT_FOUND };
  if (!isAccountStorageConfigured()) return { ok: false, error: NO_STORAGE };

  let investor: Investor | null;
  try {
    investor = await getInvestor(investorId);
  } catch (error) {
    console.error("Reading investor for a statement failed", error);
    return { ok: false, error: "The investor could not be loaded. Please try again." };
  }
  const investment = investor?.investments.find((i) => i.id === investmentId);
  if (!investor || !investment) return { ok: false, error: "This investment could not be found. Reload the page." };

  const data = buildStatementData(investor, investment, todayUtc(), { forAdmin: true });
  if (!data) return { ok: false, error: "The payout schedule of this investment could not be calculated." };
  return { ok: true, data };
}

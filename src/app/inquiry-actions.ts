"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import {
  DEFAULT_LEAD_SOURCE,
  inquiryReference,
  makeInquiryId,
  parseInquiryForm,
  type InquiryField,
  type StoredInquiry,
} from "@/lib/inquiry";
import type { ProductSettings } from "@/lib/products";
import { buildScenarios } from "@/lib/scenarios";
import { visitorActor } from "@/lib/audit";
import { formatDollars } from "@/lib/format";
import { recordAudit } from "@/lib/server/audit-store";
import { isEmailEnabled, sendAcknowledgement, sendInquiryAlerts } from "@/lib/server/email";
import { isInquiryStorageConfigured, saveInquiry } from "@/lib/server/inquiry-store";
import { notifyNewInquiry } from "@/lib/server/notifications-store";
import { getCurrentProducts } from "@/lib/server/products-store";
import { clientKey, LoginThrottle } from "@/lib/server/login-throttle";
import { getCurrentRates } from "@/lib/server/rates-store";
import { siteOrigin } from "@/lib/server/site-url";

export interface InquiryState {
  status: "idle" | "sent" | "error";
  message?: string;
  reference?: string;
  /** A confirmation email is on its way. */
  emailed?: boolean;
  fieldErrors?: Partial<Record<InquiryField | "plan", string>>;
  /** What the visitor typed, so the form keeps it after an error. */
  values?: Partial<Record<InquiryField, string>>;
}

// At most 5 inquiries per client per hour (per server instance).
const inquiryLimiter = new LoginThrottle(5, 60 * 60 * 1000);

function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of [
    "name",
    "email",
    "phone",
    "message",
    "howFound",
    "webinarDetails",
    "referrerContact",
    "website",
    "principal",
    "lockInYears",
    "frequency",
    "payoutType",
    "investmentDate",
    "source",
  ]) {
    const value = formData.get(key);
    out[key] = typeof value === "string" ? value : "";
  }
  return out;
}

export async function submitInquiryAction(_prev: InquiryState, formData: FormData): Promise<InquiryState> {
  const raw = formValues(formData);
  const values = {
    name: raw.name,
    email: raw.email,
    phone: raw.phone,
    message: raw.message,
    howFound: raw.howFound,
    webinarDetails: raw.webinarDetails,
    referrerContact: raw.referrerContact,
  };

  let products: ProductSettings;
  try {
    products = await getCurrentProducts();
  } catch (error) {
    console.error("Reading amounts and terms for an inquiry failed", error);
    return { status: "error", message: "Inquiries cannot be received right now. Please try again later.", values };
  }
  const parsed = parseInquiryForm(raw, products);
  if (!parsed.ok) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: parsed.errors, values };
  }

  const client = clientKey(await headers());
  const now = Date.now();
  if (inquiryLimiter.blockedFor(client, now) > 0) {
    return {
      status: "error",
      message: "You have sent several inquiries recently. Please try again later.",
      values,
    };
  }
  inquiryLimiter.recordFailure(client, now);

  const id = makeInquiryId(new Date(now), randomBytes(4).toString("hex"));
  const reference = inquiryReference(id);

  // Bots that fill the hidden field get the normal thank-you, but nothing is stored.
  if (parsed.isSpam) return { status: "sent", reference };

  if (!isInquiryStorageConfigured()) {
    return { status: "error", message: "Inquiries cannot be received right now. Please try again later.", values };
  }

  try {
    const rates = await getCurrentRates();
    const { selected } = buildScenarios(parsed.plan, rates, products.frequencies);
    const inquiry: StoredInquiry = {
      id,
      createdAt: new Date(now).toISOString(),
      status: "new",
      ...parsed.contact,
      plan: {
        ...parsed.plan,
        startDate: selected.startDate,
        annualRatePercent: selected.inputs.annualRatePercent,
        totalInterestCents: selected.totals.interestCents,
        totalPaidCents: selected.totals.payoutCents,
      },
      source: parsed.source,
    };
    await saveInquiry(inquiry);
    const via = inquiry.source === DEFAULT_LEAD_SOURCE ? "" : ` (source: ${inquiry.source})`;
    const contactInfo = inquiry.email || inquiry.phone;
    recordAudit({
      actor: visitorActor(inquiry.name),
      category: "inquiry",
      action: "inquiry.received",
      summary: `Inquiry ${reference} received from ${inquiry.name} (${contactInfo}) for ${formatDollars(inquiry.plan.principal)}${via}`,
      target: { type: "inquiry", id: inquiry.id, label: `${reference} (${inquiry.name})` },
    });
    // Each Master and Sales Admin gets the inquiry on their own unread list (the bell in the admin header).
    after(() => notifyNewInquiry(inquiry.id, inquiry.createdAt));
    // The thank-you email and the alerts to admins go out after the response, so the visitor never waits for them.
    if (isEmailEnabled()) {
      const origin = siteOrigin(await headers());
      after(() => sendAcknowledgement(inquiry));
      after(() => sendInquiryAlerts(inquiry, origin));
    }
  } catch (error) {
    console.error("Saving inquiry failed", error);
    return { status: "error", message: "Your inquiry could not be sent. Please try again.", values };
  }

  return { status: "sent", reference, emailed: isEmailEnabled() };
}

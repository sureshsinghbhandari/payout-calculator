"use server";

import { refresh } from "next/cache";
import { adminActor } from "@/lib/audit";
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_INFO,
  TEMPLATE_KEYS,
  validateTemplate,
  type EmailTemplate,
  type TemplateKey,
} from "@/lib/email-templates";
import { recordAudit } from "@/lib/server/audit-store";
import { requireAdminPermission } from "@/lib/server/auth";
import { isTemplateStorageConfigured, saveEmailTemplate } from "@/lib/server/email-templates-store";

/** Saves or resets an email template (Master Admin, Settings > Email templates). */

export interface TemplateState {
  status: "idle" | "ok" | "error";
  message?: string;
  fieldErrors?: Partial<Record<"subject" | "body", string>>;
  /** The template now in use, after a save or reset. */
  template?: EmailTemplate;
}

function isTemplateKey(value: unknown): value is TemplateKey {
  return typeof value === "string" && (TEMPLATE_KEYS as readonly string[]).includes(value);
}

export async function saveTemplateAction(_prev: TemplateState, formData: FormData): Promise<TemplateState> {
  const user = await requireAdminPermission("email.manage");
  if (!user) return { status: "error", message: "You do not have permission to do this, or your session has ended." };
  const key = formData.get("key");
  const intent = formData.get("intent");
  if (!isTemplateKey(key) || (intent !== "save" && intent !== "reset")) {
    return { status: "error", message: "Something went wrong. Reload the page and try again." };
  }
  if (!isTemplateStorageConfigured()) {
    return { status: "error", message: "Storage is not connected, so templates cannot be saved." };
  }
  const label = TEMPLATE_INFO[key].label;

  if (intent === "reset") {
    try {
      await saveEmailTemplate(key, null, user);
    } catch (error) {
      console.error("Resetting email template failed", key, error);
      return { status: "error", message: "The template could not be reset. Please try again." };
    }
    recordAudit({
      actor: adminActor(user),
      category: "email",
      action: "email.template_reset",
      summary: `Reset the "${label}" email template to the default wording`,
    });
    refresh();
    return { status: "ok", message: "Back to the default wording.", template: DEFAULT_TEMPLATES[key] };
  }

  const subject = formData.get("subject");
  const body = formData.get("body");
  const checked = validateTemplate(key, {
    subject: typeof subject === "string" ? subject.slice(0, 1_000) : "",
    body: typeof body === "string" ? body.slice(0, 20_000) : "",
  });
  if (!checked.ok) return { status: "error", message: "Fix the highlighted fields.", fieldErrors: checked.errors };

  try {
    await saveEmailTemplate(key, checked.value, user);
  } catch (error) {
    console.error("Saving email template failed", key, error);
    return { status: "error", message: "The template could not be saved. Please try again." };
  }
  recordAudit({
    actor: adminActor(user),
    category: "email",
    action: "email.template_saved",
    summary: `Changed the "${label}" email template`,
  });
  refresh();
  return { status: "ok", message: "Saved. New emails use this wording.", template: checked.value };
}

"use server";

import { refresh } from "next/cache";
import { adminActor } from "@/lib/audit";
import { formatIsoDate } from "@/lib/format";
import { inquiryReference, isFollowUpDate, isInquiryId, type InquiryAssignee } from "@/lib/inquiry";
import { listAdminUsers } from "@/lib/server/accounts-store";
import { recordAudit } from "@/lib/server/audit-store";
import { requireAdminPermission } from "@/lib/server/auth";
import { getInquiry, setInquiryFollowUp } from "@/lib/server/inquiry-store";

export interface FollowUpState {
  status: "idle" | "saved" | "error";
  message?: string;
}

/**
 * Assigns an inquiry to an admin user and sets its follow-up date (Master and
 * Sales Admins). Each change is recorded in the audit log, so it also shows
 * on the inquiry's activity.
 */
export async function saveFollowUpAction(_prev: FollowUpState, formData: FormData): Promise<FollowUpState> {
  const user = await requireAdminPermission("inquiries.assign");
  if (!user) return { status: "error", message: "You do not have permission to do this." };
  const id = formData.get("id");
  const assignee = formData.get("assignedTo");
  const rawDate = formData.get("followUpDate");
  const followUpDate = typeof rawDate === "string" ? rawDate.trim() : "";
  if (typeof id !== "string" || !isInquiryId(id) || typeof assignee !== "string") {
    return { status: "error", message: "This inquiry was not found." };
  }
  if (followUpDate !== "" && !isFollowUpDate(followUpDate)) {
    return { status: "error", message: "Enter a valid follow-up date, or leave it empty." };
  }

  const inquiry = await getInquiry(id);
  if (!inquiry || inquiry.status === "deleted") return { status: "error", message: "This inquiry was not found or is deleted." };

  let assignedTo: InquiryAssignee | null = null;
  if (assignee !== "") {
    if (inquiry.assignedTo?.id === assignee) {
      // Unchanged: kept even if that user has since been deactivated.
      assignedTo = inquiry.assignedTo;
    } else {
      const match = (await listAdminUsers()).find((u) => u.id === assignee && u.active);
      if (!match) return { status: "error", message: "Choose an active user, or Not assigned." };
      assignedTo = { id: match.id, name: match.name };
    }
  }

  if (inquiry.assignedTo?.id === assignedTo?.id && (inquiry.followUpDate ?? "") === followUpDate) {
    return { status: "saved", message: "Nothing changed." };
  }

  let result: Awaited<ReturnType<typeof setInquiryFollowUp>>;
  try {
    result = await setInquiryFollowUp(inquiry.id, { assignedTo, followUpDate: followUpDate || null });
  } catch (error) {
    console.error("Saving the assignment failed", error);
    return { status: "error", message: "The changes could not be saved. Try again." };
  }
  if (!result) return { status: "error", message: "This inquiry was not found or is deleted." };

  const { before, after } = result;
  const ref = inquiryReference(after.id);
  const target = { type: "inquiry" as const, id: after.id, label: `${ref} (${after.name})` };
  if (before.assignedTo?.id !== after.assignedTo?.id) {
    recordAudit({
      actor: adminActor(user),
      category: "inquiry",
      action: "inquiry.assigned",
      summary: after.assignedTo
        ? `Assigned inquiry ${ref} (${after.name}) to ${after.assignedTo.name}`
        : `Unassigned inquiry ${ref} (${after.name})${before.assignedTo ? ` from ${before.assignedTo.name}` : ""}`,
      target,
    });
  }
  if (before.followUpDate !== after.followUpDate) {
    recordAudit({
      actor: adminActor(user),
      category: "inquiry",
      action: "inquiry.follow_up",
      summary: after.followUpDate
        ? `Set the follow-up date of inquiry ${ref} (${after.name}) to ${formatIsoDate(after.followUpDate)}`
        : `Cleared the follow-up date of inquiry ${ref} (${after.name})`,
      target,
    });
  }
  refresh();
  return { status: "saved", message: "Saved." };
}

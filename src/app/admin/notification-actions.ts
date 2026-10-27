"use server";

import { refresh } from "next/cache";
import { requireAdminPermission } from "@/lib/server/auth";
import { markAllInquiriesRead } from "@/lib/server/notifications-store";

/** Marks every new-inquiry notification of the signed-in admin as read. Only their own counter changes. */
export async function markAllReadAction(): Promise<void> {
  const user = await requireAdminPermission("inquiries.view");
  if (!user) return;
  try {
    await markAllInquiriesRead(user.id);
  } catch (error) {
    console.error("Marking inquiries as read failed", error);
  }
  refresh();
}

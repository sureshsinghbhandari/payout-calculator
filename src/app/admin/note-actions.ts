"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import type { AdminUser } from "@/lib/accounts";
import { adminActor } from "@/lib/audit";
import { inquiryReference, isInquiryId, type StoredInquiry } from "@/lib/inquiry";
import { isNoteKind, NOTE_MAX_LENGTH, type InquiryNote, type InquiryNoteKind } from "@/lib/inquiry-log";
import { recordAudit } from "@/lib/server/audit-store";
import { requireAdminPermission } from "@/lib/server/auth";
import { addInquiryNote } from "@/lib/server/inquiry-log-store";
import { getInquiry, noteInquiryNote, setInquiryStatus } from "@/lib/server/inquiry-store";

export interface NoteState {
  status: "idle" | "added" | "error";
  message?: string;
  /** What the admin typed, kept after an error. */
  text?: string;
  /** When the last note was saved; starts a new, empty form. */
  savedAt?: string;
}

// Control characters other than newline/tab are never valid in a note.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

type NoteInput = { ok: true; id: string; kind: InquiryNoteKind; text: string } | { ok: false; state: NoteState };

function readNoteInput(formData: FormData): NoteInput {
  const id = formData.get("id");
  const kind = formData.get("kind");
  const raw = formData.get("text");
  const text = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  const error = (message: string): NoteInput => ({ ok: false, state: { status: "error", message, text } });
  if (typeof id !== "string" || !isInquiryId(id)) return error("This inquiry was not found.");
  if (!isNoteKind(kind)) return error("Choose Note, Call or Meeting.");
  if (text === "") return error("Write the note first.");
  if (text.length > NOTE_MAX_LENGTH) return error(`Use at most ${NOTE_MAX_LENGTH} characters.`);
  if (CONTROL_CHARS.test(text)) return error("Remove unusual characters from the note.");
  return { ok: true, id, kind, text };
}

/** Saves a note on the inquiry and updates the latest-note preview on the list. */
async function saveNote(inquiry: Pick<StoredInquiry, "id">, user: AdminUser, kind: InquiryNoteKind, text: string): Promise<InquiryNote> {
  const note: InquiryNote = {
    id: randomBytes(6).toString("hex"),
    at: new Date().toISOString(),
    kind,
    author: adminActor(user),
    text,
  };
  await addInquiryNote(inquiry.id, note);
  try {
    await noteInquiryNote(inquiry.id, { at: note.at, kind, by: user.name, text });
  } catch (error) {
    // The note is saved; only the preview on the Inquiries list is behind.
    console.error("Updating the notes summary failed", error);
  }
  return note;
}

/**
 * Adds a note, call or meeting to an inquiry (Master and Sales Admins). Notes
 * live only on the inquiry, so they are not copied to the audit log.
 */
export async function addInquiryNoteAction(_prev: NoteState, formData: FormData): Promise<NoteState> {
  const user = await requireAdminPermission("inquiries.notes");
  if (!user) return { status: "error", message: "You do not have permission to add notes." };
  const input = readNoteInput(formData);
  if (!input.ok) return input.state;

  const inquiry = await getInquiry(input.id);
  if (!inquiry || inquiry.status === "deleted") {
    return { status: "error", message: "This inquiry was not found or is deleted.", text: input.text };
  }
  let note: InquiryNote;
  try {
    note = await saveNote(inquiry, user, input.kind, input.text);
  } catch (error) {
    console.error("Adding note failed", error);
    return { status: "error", message: "The note could not be saved. Try again.", text: input.text };
  }
  refresh();
  return { status: "added", message: "Saved.", savedAt: note.at };
}

/**
 * Marks a new inquiry as contacted together with a note on how the customer
 * was contacted and what was said (Master and Sales Admins). The note is
 * required and goes on the inquiry's activity next to the status change.
 */
export async function markContactedAction(_prev: NoteState, formData: FormData): Promise<NoteState> {
  const user = await requireAdminPermission("inquiries.status");
  if (!user) return { status: "error", message: "You do not have permission to do this." };
  const input = readNoteInput(formData);
  if (!input.ok) return input.state;

  const inquiry = await getInquiry(input.id);
  if (!inquiry || inquiry.status !== "new") {
    return { status: "error", message: "This inquiry is no longer new. Reload the page.", text: input.text };
  }
  const ref = inquiryReference(inquiry.id);
  try {
    const updated = await setInquiryStatus(inquiry.id, "contacted");
    if (!updated) return { status: "error", message: "This inquiry is no longer new. Reload the page.", text: input.text };
    recordAudit({
      actor: adminActor(user),
      category: "inquiry",
      action: "inquiry.status",
      summary: `Marked inquiry ${ref} (${inquiry.name}) as contacted`,
      target: { type: "inquiry", id: inquiry.id, label: `${ref} (${inquiry.name})` },
    });
  } catch (error) {
    console.error("Marking inquiry as contacted failed", error);
    return { status: "error", message: "The inquiry could not be updated. Try again.", text: input.text };
  }

  let note: InquiryNote;
  try {
    note = await saveNote(inquiry, user, input.kind, input.text);
  } catch (error) {
    console.error("Saving the contact note failed", error);
    refresh();
    return {
      status: "error",
      message: "Marked as contacted, but the note could not be saved. Add it on the inquiry's page.",
      text: input.text,
    };
  }
  refresh();
  return { status: "added", message: "Marked as contacted.", savedAt: note.at };
}

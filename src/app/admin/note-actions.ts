"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { adminActor } from "@/lib/audit";
import { isInquiryId } from "@/lib/inquiry";
import { isNoteKind, NOTE_MAX_LENGTH, type InquiryNote } from "@/lib/inquiry-log";
import { requireAdminPermission } from "@/lib/server/auth";
import { addInquiryNote } from "@/lib/server/inquiry-log-store";
import { getInquiry, noteInquiryNote } from "@/lib/server/inquiry-store";

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

/**
 * Adds a note, call or meeting to an inquiry (Master and Sales Admins). Notes
 * live only on the inquiry, so they are not copied to the audit log.
 */
export async function addInquiryNoteAction(_prev: NoteState, formData: FormData): Promise<NoteState> {
  const user = await requireAdminPermission("inquiries.notes");
  if (!user) return { status: "error", message: "You do not have permission to add notes." };
  const id = formData.get("id");
  const kind = formData.get("kind");
  const raw = formData.get("text");
  const text = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (typeof id !== "string" || !isInquiryId(id)) return { status: "error", message: "This inquiry was not found." };
  if (!isNoteKind(kind)) return { status: "error", message: "Choose Note, Call or Meeting.", text };
  if (text === "") return { status: "error", message: "Write the note first.", text };
  if (text.length > NOTE_MAX_LENGTH) return { status: "error", message: `Use at most ${NOTE_MAX_LENGTH} characters.`, text };
  if (CONTROL_CHARS.test(text)) return { status: "error", message: "Remove unusual characters from the note.", text };

  const inquiry = await getInquiry(id);
  if (!inquiry || inquiry.status === "deleted") {
    return { status: "error", message: "This inquiry was not found or is deleted.", text };
  }

  const note: InquiryNote = {
    id: randomBytes(6).toString("hex"),
    at: new Date().toISOString(),
    kind,
    author: adminActor(user),
    text,
  };
  try {
    await addInquiryNote(inquiry.id, note);
  } catch (error) {
    console.error("Adding note failed", error);
    return { status: "error", message: "The note could not be saved. Try again.", text };
  }
  try {
    await noteInquiryNote(inquiry.id, { at: note.at, kind, by: user.name, text });
  } catch (error) {
    // The note is saved; only the preview on the Inquiries list is behind.
    console.error("Updating the notes summary failed", error);
  }
  refresh();
  return { status: "added", message: "Saved.", savedAt: note.at };
}

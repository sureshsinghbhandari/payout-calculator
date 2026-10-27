/**
 * Activity and notes of one inquiry: a copy of every audit event about the
 * inquiry, plus the notes, calls and meetings staff add to it. Pure helpers.
 */
import { parseAuditEvents, type AuditActor, type AuditEvent } from "./audit";

export type InquiryNoteKind = "note" | "call" | "meeting";

export const NOTE_KIND_LABELS: Record<InquiryNoteKind, string> = {
  note: "Note",
  call: "Call",
  meeting: "Meeting",
};

export const NOTE_KINDS: InquiryNoteKind[] = ["note", "call", "meeting"];

export const NOTE_MAX_LENGTH = 2000;

export interface InquiryNote {
  id: string;
  /** ISO timestamp (UTC). */
  at: string;
  kind: InquiryNoteKind;
  author: AuditActor;
  text: string;
}

export interface InquiryLog {
  inquiryId: string;
  events: AuditEvent[];
  notes: InquiryNote[];
  /** True once events recorded before inquiry logs existed have been copied in. */
  backfilled: boolean;
}

export type TimelineEntry = { kind: "event"; at: string; event: AuditEvent } | { kind: "note"; at: string; note: InquiryNote };

export function isNoteKind(value: unknown): value is InquiryNoteKind {
  return value === "note" || value === "call" || value === "meeting";
}

function parseNotes(list: unknown): InquiryNote[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((raw) => {
    const d = (raw ?? {}) as Record<string, unknown>;
    const author = d.author as AuditActor | undefined;
    if (typeof d.id !== "string" || typeof d.at !== "string" || typeof d.text !== "string") return [];
    if (typeof author?.name !== "string") return [];
    return [{ id: d.id, at: d.at, kind: isNoteKind(d.kind) ? d.kind : "note", author, text: d.text }];
  });
}

export function parseInquiryLog(inquiryId: string, data: unknown): InquiryLog {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    inquiryId,
    events: parseAuditEvents(d.events),
    notes: parseNotes(d.notes),
    backfilled: d.backfilled === true,
  };
}

/** Events and notes together, newest first. */
export function inquiryTimeline(log: InquiryLog): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...log.events.map((event) => ({ kind: "event" as const, at: event.at, event })),
    ...log.notes.map((note) => ({ kind: "note" as const, at: note.at, note })),
  ];
  return entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

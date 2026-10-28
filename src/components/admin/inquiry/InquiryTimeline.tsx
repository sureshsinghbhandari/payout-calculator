import { ROLE_LABELS } from "@/lib/accounts";
import { AUDIT_CATEGORY_LABELS, type AuditActor } from "@/lib/audit";
import { NOTE_KIND_LABELS, type TimelineEntry } from "@/lib/inquiry-log";
import { formatMeeting, type Meeting } from "@/lib/meeting";

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function actorText(actor: AuditActor): string {
  if (actor.kind === "admin") return actor.role ? `${actor.name} (${ROLE_LABELS[actor.role]})` : actor.name;
  if (actor.kind === "visitor") return `${actor.name} (visitor)`;
  if (actor.kind === "investor") return `${actor.name} (investor)`;
  return "System";
}

const NOTE_STYLES = {
  note: "border-amber-200 bg-amber-50",
  call: "border-sky-200 bg-sky-50",
  meeting: "border-violet-200 bg-violet-50",
} as const;

/** "Meeting scheduled for ..." under the note or call that booked it. */
function MeetingLine({ meeting }: { meeting: Meeting }) {
  const { local, utc } = formatMeeting(meeting);
  return (
    <p className="mt-2 text-sm font-semibold text-emerald-800">
      Meeting scheduled for {local}
      {utc && <span className="font-normal text-slate-600"> ({utc})</span>}
    </p>
  );
}

/** Notes and activity of one inquiry, newest first: one row per entry. */
export function InquiryTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-slate-600">Nothing recorded yet.</p>;
  return (
    <ol className="space-y-2">
      {entries.map((entry) => {
        const when = `${timestampFormatter.format(new Date(entry.at))} UTC`;
        if (entry.kind === "note") {
          const { note } = entry;
          return (
            <li key={`n-${note.id}`} className={`rounded-xl border p-3 ${NOTE_STYLES[note.kind]}`}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  {NOTE_KIND_LABELS[note.kind]}
                  <span className="font-normal normal-case tracking-normal text-slate-600"> · {actorText(note.author)}</span>
                </p>
                <p className="text-xs text-slate-500">{when}</p>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-slate-900">{note.text}</p>
              {note.meeting && <MeetingLine meeting={note.meeting} />}
            </li>
          );
        }
        const { event } = entry;
        return (
          <li key={`e-${event.id}`} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {AUDIT_CATEGORY_LABELS[event.category] ?? "Activity"}
                <span className="font-normal normal-case tracking-normal"> · {actorText(event.actor)}</span>
              </p>
              <p className="text-xs text-slate-500">{when}</p>
            </div>
            <p className="mt-1 break-words text-sm text-slate-800">{event.summary}</p>
          </li>
        );
      })}
    </ol>
  );
}

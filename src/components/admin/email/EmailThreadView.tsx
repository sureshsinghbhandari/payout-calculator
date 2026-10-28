import { EMAIL_DELIVERY_LABELS, newPartOfReply, type EmailMessage } from "@/lib/email";
import { formatTimestamp } from "@/lib/time";

const KIND_LABELS: Record<EmailMessage["kind"], string> = {
  acknowledgement: "Automatic acknowledgement",
  reply: "Reply from staff",
  customer: "From the customer",
};

/** The emails of one inquiry, oldest first. Bodies are shown as plain text, never as HTML. */
export function EmailThreadView({ messages }: { messages: EmailMessage[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-slate-600">No emails yet.</p>;
  }
  return (
    <ol className="space-y-3">
      {messages.map((m) => {
        const incoming = m.direction === "in";
        const shown = incoming ? newPartOfReply(m.text) : m.text;
        const trimmed = shown.length < m.text.trim().length;
        const problem = m.delivery === "bounced" || m.delivery === "failed" || m.delivery === "complained";
        return (
          <li
            key={m.id}
            className={`rounded-xl border p-4 ${incoming ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-white"} ${incoming ? "sm:mr-10" : "sm:ml-10"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                {KIND_LABELS[m.kind]}
                {m.sentBy && <span className="font-normal normal-case tracking-normal"> · {m.sentBy.name}</span>}
              </p>
              <p className="text-xs text-slate-500">{formatTimestamp(m.at)}</p>
            </div>
            <p className="mt-1 break-words text-sm font-semibold text-slate-900">{m.subject}</p>
            <p className="mt-0.5 break-all text-xs text-slate-500">
              {incoming ? `From ${m.from}` : `To ${m.to}`}
              {m.delivery && (
                <span className={problem ? "font-semibold text-red-700" : ""}>
                  {" "}
                  · {EMAIL_DELIVERY_LABELS[m.delivery]}
                  {m.deliveryNote && problem ? `: ${m.deliveryNote}` : ""}
                </span>
              )}
            </p>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">{shown}</p>
            {trimmed && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-blue-800 hover:text-blue-950">
                  Show the full email
                </summary>
                <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-white/70 p-3 text-xs leading-relaxed text-slate-700">
                  {m.text}
                </p>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}

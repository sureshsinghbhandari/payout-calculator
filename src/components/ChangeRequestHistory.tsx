import { formatTimestamp } from "@/components/admin/investors/fields";
import {
  CHANGE_KIND_LABELS,
  CHANGE_STATUS_BADGES,
  CHANGE_STATUS_LABELS,
  maskedAccountNumber,
  type ChangeRequestView,
} from "@/lib/profile-requests";

/**
 * A list of change requests and their outcome, for the investor's admin page
 * and the portal. Only the last 4 characters of account numbers are shown.
 */
export function ChangeRequestHistory({
  requests,
  audience,
}: {
  requests: ChangeRequestView[];
  audience: "admin" | "investor";
}) {
  return (
    <ul className="divide-y divide-slate-200">
      {requests.map((r) => (
        <li key={r.id} className="py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{CHANGE_KIND_LABELS[r.kind]}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHANGE_STATUS_BADGES[r.status]}`}>
              {CHANGE_STATUS_LABELS[r.status]}
            </span>
          </div>
          <p className="mt-1 break-words text-slate-700">{describe(r)}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Sent {formatTimestamp(r.requestedAt)}
            {r.decidedAt && r.status !== "pending" && (
              <>
                {" "}
                · {r.status === "withdrawn" ? "Withdrawn" : "Reviewed"} {formatTimestamp(r.decidedAt)}
                {audience === "admin" && r.decidedBy && <> by {r.decidedBy}</>}
              </>
            )}
          </p>
          {r.reason && <p className="mt-1 break-words text-xs text-slate-700">Reason: {r.reason}</p>}
        </li>
      ))}
    </ul>
  );
}

function describe(r: ChangeRequestView): string {
  if (r.kind === "contact" && r.contact) {
    return `Email ${r.contact.email}, phone ${r.contact.phone || "(none)"}`;
  }
  const bank = r.bank ? `${r.bank.bankName}, ` : "";
  return `${bank}account ${maskedAccountNumber(r.bankLast4 ?? "????")}`;
}

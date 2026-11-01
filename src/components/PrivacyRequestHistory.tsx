import { formatTimestamp } from "@/components/admin/investors/fields";
import {
  PRIVACY_KIND_LABELS,
  PRIVACY_STATUS_BADGES,
  PRIVACY_STATUS_LABELS,
  type PrivacyRequest,
} from "@/lib/privacy-requests";

/**
 * A list of privacy requests (copy of data / account deletion) and their
 * outcome, for the investor's admin page and the portal. Mirrors
 * ChangeRequestHistory.
 */
export function PrivacyRequestHistory({
  requests,
  audience,
}: {
  requests: PrivacyRequest[];
  audience: "admin" | "investor";
}) {
  return (
    <ul className="divide-y divide-slate-200">
      {requests.map((r) => (
        <li key={r.id} className="py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{PRIVACY_KIND_LABELS[r.kind]}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIVACY_STATUS_BADGES[r.status]}`}>
              {PRIVACY_STATUS_LABELS[r.status]}
            </span>
          </div>
          {r.note && <p className="mt-1 break-words text-slate-700">Note: {r.note}</p>}
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

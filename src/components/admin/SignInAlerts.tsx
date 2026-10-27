import Link from "next/link";
import { ALERT_DAYS, detectSignInAlerts, NEW_CLIENT_LOOKBACK_DAYS, type SignInAlert } from "@/lib/sign-in-alerts";
import { listAuditEventsBetween } from "@/lib/server/audit-store";

const DAY_MS = 24 * 60 * 60 * 1000;

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

const clockFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

/** Sign-in alerts of the last ALERT_DAYS days, newest first (null when the audit log could not be read). */
async function loadAlerts(): Promise<SignInAlert[] | null> {
  const now = Date.now();
  const since = new Date(now - ALERT_DAYS * DAY_MS).toISOString();
  // New-device checks look back a further 30 days.
  const from = new Date(now - (ALERT_DAYS + NEW_CLIENT_LOOKBACK_DAYS) * DAY_MS).toISOString();
  try {
    const events = await listAuditEventsBetween(from, new Date(now + 60_000).toISOString());
    return detectSignInAlerts(events, since);
  } catch (error) {
    console.error("Checking sign-in alerts failed", error);
    return null;
  }
}

function describe(alert: SignInAlert): { title: string; detail: string; when: string } {
  if (alert.kind === "failed-sign-ins") {
    const first = new Date(alert.firstAt);
    const last = new Date(alert.lastAt);
    const sameDay = alert.firstAt.slice(0, 10) === alert.lastAt.slice(0, 10);
    return {
      title: `${alert.count} failed ${alert.portal === "admin" ? "admin" : "investor portal"} sign-ins for “${alert.username}”`,
      detail: "Someone may be trying to guess this password.",
      when: `${timeFormatter.format(first)} to ${sameDay ? clockFormatter.format(last) : timeFormatter.format(last)}`,
    };
  }
  return {
    title: `${alert.name}${alert.username ? ` (${alert.username})` : ""} signed in to admin from a new device or network`,
    detail: `Not used by this person in the ${NEW_CLIENT_LOOKBACK_DAYS} days before. If this was not them, change their password.`,
    when: timeFormatter.format(new Date(alert.at)),
  };
}

/**
 * "Sign-in alerts" panel for Master Admins: repeated failed sign-ins and admin
 * sign-ins from a new device or network, from the audit log. `limit` caps how
 * many are listed.
 */
export async function SignInAlerts({ limit, showAuditLink }: { limit: number; showAuditLink: boolean }) {
  const alerts = await loadAlerts();
  const shown = alerts?.slice(0, limit) ?? [];

  return (
    <section aria-labelledby="sign-in-alerts-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sign-in-alerts-heading" className="text-base font-semibold text-slate-900">
          Sign-in alerts
        </h2>
        <span className="text-xs text-slate-500">Last {ALERT_DAYS} days, times in UTC</span>
      </div>
      {alerts === null ? (
        <p role="alert" className="mt-3 text-sm font-medium text-red-700">
          Sign-in alerts could not be checked. Reload the page to try again.
        </p>
      ) : alerts.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">No alerts. Nothing unusual about recent sign-ins.</p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-slate-100">
            {shown.map((alert) => {
              const { title, detail, when } = describe(alert);
              return (
                <li key={alert.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                      alert.kind === "failed-sign-ins" ? "bg-red-600" : "bg-amber-500"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-slate-900">{title}</p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      <span className="tabular-nums">{when}</span>. {detail}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          {alerts.length > shown.length && (
            <p className="mt-3 text-xs text-slate-500">
              Showing the newest {shown.length} of {alerts.length} alerts.
            </p>
          )}
        </>
      )}
      {showAuditLink && (
        <p className="mt-4 text-sm">
          <Link
            href="/admin/settings/audit?category=sign-in"
            className="font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950"
          >
            See all sign-in activity
          </Link>
        </p>
      )}
    </section>
  );
}

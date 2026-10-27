/**
 * Sign-in alerts, worked out from the audit log. Pure functions so they can be
 * unit tested.
 *
 * - Repeated failures: 5 or more failed sign-ins for the same username (admin
 *   or investor) within 15 minutes. One alert covers the whole burst.
 * - New device or network: a successful admin sign-in from a client (see
 *   `AuditEvent.client`) the person did not use in the previous 30 days. Only
 *   raised when the person has earlier sign-ins with a known client in that
 *   time, so the first sign-ins after this feature started do not count.
 */
import type { AuditEvent } from "./audit";

export const FAILED_SIGN_IN_THRESHOLD = 5;
export const FAILED_SIGN_IN_WINDOW_MS = 15 * 60 * 1000;
export const NEW_CLIENT_LOOKBACK_DAYS = 30;
/** How far back the alert panels look. */
export const ALERT_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SignInPortal = "admin" | "investor";

export type SignInAlert =
  | {
      kind: "failed-sign-ins";
      id: string;
      portal: SignInPortal;
      username: string;
      count: number;
      /** ISO timestamps of the first and last failure in the burst. */
      firstAt: string;
      lastAt: string;
    }
  | {
      kind: "new-client";
      id: string;
      /** ISO timestamp of the sign-in. */
      at: string;
      name: string;
      username: string;
    };

/** When the alert happened (the last failure, or the sign-in). */
export function alertTime(alert: SignInAlert): string {
  return alert.kind === "failed-sign-ins" ? alert.lastAt : alert.at;
}

const FAILED_ACTIONS: Record<string, SignInPortal> = {
  "admin.sign_in_failed": "admin",
  "investor.sign_in_failed": "investor",
};

function failedSignInAlerts(events: AuditEvent[]): SignInAlert[] {
  // Failure times per portal and username, oldest first.
  const groups = new Map<string, { portal: SignInPortal; username: string; times: string[] }>();
  for (const event of events) {
    const portal = FAILED_ACTIONS[event.action];
    const username = event.actor.username;
    if (!portal || !username) continue;
    const key = `${portal}\u0000${username}`;
    const group = groups.get(key) ?? { portal, username, times: [] };
    group.times.push(event.at);
    groups.set(key, group);
  }

  const alerts: SignInAlert[] = [];
  for (const { portal, username, times } of groups.values()) {
    times.sort();
    const ms = times.map((t) => Date.parse(t));
    let windowStart = 0;
    let burst: Extract<SignInAlert, { kind: "failed-sign-ins" }> | null = null;
    let burstStart = 0;
    for (let i = 0; i < ms.length; i++) {
      while (ms[i] - ms[windowStart] > FAILED_SIGN_IN_WINDOW_MS) windowStart++;
      if (i - windowStart + 1 < FAILED_SIGN_IN_THRESHOLD) {
        burst = null;
        continue;
      }
      if (!burst) {
        // A new burst: it starts with the oldest failure in the window.
        burstStart = windowStart;
        burst = {
          kind: "failed-sign-ins",
          id: `failed:${portal}:${username}:${times[burstStart]}`,
          portal,
          username,
          count: 0,
          firstAt: times[burstStart],
          lastAt: times[i],
        };
        alerts.push(burst);
      }
      burst.count = i - burstStart + 1;
      burst.lastAt = times[i];
    }
  }
  return alerts;
}

function newClientAlerts(events: AuditEvent[]): SignInAlert[] {
  const alerts: SignInAlert[] = [];
  // Earlier sign-ins with a known client, per admin.
  const history = new Map<string, { atMs: number; client: string }[]>();
  for (const event of events) {
    if (event.action !== "admin.sign_in" || !event.client || !event.actor.id) continue;
    const atMs = Date.parse(event.at);
    const earlier = (history.get(event.actor.id) ?? []).filter(
      (h) => atMs - h.atMs <= NEW_CLIENT_LOOKBACK_DAYS * DAY_MS,
    );
    if (earlier.length > 0 && !earlier.some((h) => h.client === event.client)) {
      alerts.push({
        kind: "new-client",
        id: `client:${event.id}`,
        at: event.at,
        name: event.actor.name,
        username: event.actor.username ?? "",
      });
    }
    history.set(event.actor.id, [...earlier, { atMs, client: event.client }]);
  }
  return alerts;
}

/**
 * Alerts that happened at or after `sinceIso`, newest first. Pass events from
 * at least NEW_CLIENT_LOOKBACK_DAYS before `sinceIso`, so new-device checks
 * have the history they need.
 */
export function detectSignInAlerts(events: AuditEvent[], sinceIso: string): SignInAlert[] {
  const sorted = events
    .filter((e) => e.category === "sign-in")
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return [...failedSignInAlerts(sorted), ...newClientAlerts(sorted)]
    .filter((alert) => alertTime(alert) >= sinceIso)
    .sort((a, b) => (alertTime(a) < alertTime(b) ? 1 : alertTime(a) > alertTime(b) ? -1 : 0));
}

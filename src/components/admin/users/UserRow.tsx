"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import {
  changeRoleAction,
  createSetupLinkAction,
  setActiveAction,
  type ActionMessage,
  type SetupLinkState,
} from "@/app/admin/settings/users/actions";
import { ROLE_LABELS, type AdminRole, type PublicAdmin } from "@/lib/accounts";
import { SetupLinkPanel } from "./SetupLinkPanel";
import { TemporaryPasswordForm } from "./TemporaryPasswordForm";
import { dangerButton, formatTimestamp, secondaryButton } from "./ui";

const ROLES: AdminRole[] = ["master", "sales"];

type Tone = "ok" | "warn" | "muted";

/** Sign-in state for display: Has password / Must change password / Setup link pending / Not set up. */
export function signInState(user: PublicAdmin, nowMs: number): { label: string; detail?: string; tone: Tone } {
  const linkPending = user.setupExpiresAt !== null && Date.parse(user.setupExpiresAt) > nowMs;
  const pendingText = linkPending && user.setupExpiresAt ? `Setup link pending until ${formatTimestamp(user.setupExpiresAt)}` : undefined;
  if (user.hasPassword) {
    return user.mustChangePassword
      ? { label: "Must change password", detail: pendingText, tone: "warn" }
      : { label: "Has password", detail: pendingText, tone: "ok" };
  }
  if (pendingText) return { label: pendingText, tone: "warn" };
  return {
    label: "Not set up",
    detail: user.setupExpiresAt ? "The last setup link has expired." : undefined,
    tone: "muted",
  };
}

const TONE_DOT: Record<Tone, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  muted: "bg-slate-400",
};

interface Props {
  user: PublicAdmin;
  isSelf: boolean;
  nowMs: number;
  minPasswordLength: number;
}

export function UserRow({ user, isSelf, nowMs, minPasswordLength }: Props) {
  const baseId = useId();
  const roleId = `${baseId}-role`;
  const signIn = signInState(user, nowMs);

  // Role and access changes share one status line that shows the latest result.
  const [accessState, accessAction, accessPending] = useActionState<ActionMessage, FormData>(
    (prev, formData) => (formData.get("intent") === "role" ? changeRoleAction(prev, formData) : setActiveAction(prev, formData)),
    { status: "idle" },
  );
  const [linkState, linkAction, linkPending] = useActionState<SetupLinkState, FormData>(createSetupLinkAction, {
    status: "idle",
  });
  const [dismissedToken, setDismissedToken] = useState<string | null>(null);
  const [passwordFormKey, setPasswordFormKey] = useState<number | null>(null);

  const linkToken = linkState.status === "ok" && linkState.token !== dismissedToken ? linkState.token : undefined;

  return (
    <li className={`rounded-2xl border border-slate-200 p-5 shadow-sm ${user.active ? "bg-white" : "bg-slate-50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900">
            {user.name}
            {isSelf && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                You
              </span>
            )}
          </h3>
          <p className="mt-0.5 break-all font-mono text-sm text-slate-600">{user.username}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              user.role === "master" ? "bg-blue-900 text-white" : "bg-blue-100 text-blue-900"
            }`}
          >
            {ROLE_LABELS[user.role]}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              user.active ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
            }`}
          >
            {user.active ? "Active" : "Disabled"}
          </span>
        </div>
      </div>

      <dl className="mt-3 text-sm">
        <dt className="sr-only">Sign-in</dt>
        <dd className="flex items-start gap-2 text-slate-800">
          <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[signIn.tone]}`} />
          <span>
            {signIn.label}
            {signIn.detail && <span className="block text-xs text-slate-500">{signIn.detail}</span>}
          </span>
        </dd>
      </dl>

      <div className="mt-4 border-t border-slate-100 pt-4">
        {isSelf ? (
          <p className="text-sm text-slate-600">
            This is your account. You cannot change your own role or disable yourself; another Master Admin can. To
            change your password, go to{" "}
            <Link href="/admin/account" className="font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950">
              My account
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
              <form action={accessAction} className="flex items-end gap-2" key={user.role}>
                <input type="hidden" name="id" value={user.id} />
                <input type="hidden" name="intent" value="role" />
                <div>
                  <label htmlFor={roleId} className="block text-xs font-semibold text-slate-700">
                    Role
                  </label>
                  <select
                    id={roleId}
                    name="role"
                    defaultValue={user.role}
                    className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" disabled={accessPending} className={secondaryButton}>
                  Save role
                </button>
              </form>

              <form
                action={accessAction}
                onSubmit={(e) => {
                  if (
                    user.active &&
                    !window.confirm(`Disable ${user.name}? They are signed out and cannot sign in until you enable them again.`)
                  ) {
                    e.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="id" value={user.id} />
                <input type="hidden" name="intent" value="active" />
                <input type="hidden" name="active" value={user.active ? "false" : "true"} />
                <button type="submit" disabled={accessPending} className={user.active ? dangerButton : secondaryButton}>
                  {user.active ? "Disable" : "Enable"}
                </button>
              </form>

              <button
                type="button"
                onClick={() => setPasswordFormKey((key) => (key ?? 0) + 1)}
                aria-expanded={passwordFormKey !== null}
                className={secondaryButton}
              >
                Set temporary password
              </button>

              <form action={linkAction}>
                <input type="hidden" name="id" value={user.id} />
                <button type="submit" disabled={linkPending} className={secondaryButton}>
                  {linkPending ? "Creating…" : "Create setup link"}
                </button>
              </form>
            </div>

            <p
              role="status"
              aria-live="polite"
              className={`text-sm ${accessState.status === "error" ? "font-medium text-red-700" : "text-slate-700"} ${
                accessState.message ? "" : "sr-only"
              }`}
            >
              {accessPending ? "Saving…" : accessState.message}
            </p>

            {linkState.status === "error" && linkState.message && (
              <p role="alert" className="text-sm font-medium text-red-700">
                {linkState.message}
              </p>
            )}

            {linkToken && (
              <SetupLinkPanel
                token={linkToken}
                name={user.name}
                expiresAt={linkState.expiresAt}
                onDone={() => setDismissedToken(linkToken)}
              />
            )}

            {passwordFormKey !== null && (
              <TemporaryPasswordForm
                key={passwordFormKey}
                userId={user.id}
                name={user.name}
                username={user.username}
                minPasswordLength={minPasswordLength}
                onClose={() => setPasswordFormKey(null)}
              />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

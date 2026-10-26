"use client";

import { useActionState, useId, useRef, useState } from "react";
import {
  createInvestorSetupLinkAction,
  setInvestorAccessAction,
  setInvestorTemporaryPasswordAction,
  type InvestorActionState,
  type SetupLinkState,
  type TemporaryPasswordState,
} from "@/app/admin/investors/actions";
import { SETUP_LINK_HOURS } from "@/lib/accounts";
import { dangerButton, errorNotice, inputClass, primaryButton, secondaryButton, successNotice } from "./ui";

interface Props {
  investorId: string;
  investorName: string;
  active: boolean;
  hasPassword: boolean;
  /** Minimum password length (from the server's password rules). */
  minPasswordLength: number;
}

/** Sign-in management: login access, temporary password and setup link. */
export function InvestorAccess(props: Props) {
  return (
    <div className="divide-y divide-slate-200">
      <LoginAccess {...props} />
      <TemporaryPassword {...props} />
      <SetupLink {...props} />
    </div>
  );
}

function ActionMessage({ state }: { state: { status?: string; message?: string } }) {
  if (!state.message) return null;
  return state.status === "error" ? (
    <p role="alert" className={`mt-3 ${errorNotice}`}>
      {state.message}
    </p>
  ) : (
    <p role="status" className={`mt-3 ${successNotice}`}>
      {state.message}
    </p>
  );
}

function LoginAccess({ investorId, investorName, active }: Props) {
  const [state, formAction, pending] = useActionState<InvestorActionState, FormData>(setInvestorAccessAction, {});
  return (
    <div className="pb-6">
      <h3 className="text-sm font-semibold text-slate-900">Login access</h3>
      <p className="mt-1 text-sm text-slate-600">
        {active
          ? `Enabled. ${investorName} can sign in to the investor portal once they have a password.`
          : `Disabled. ${investorName} cannot sign in until you enable login again.`}
      </p>
      <form
        action={formAction}
        className="mt-3"
        onSubmit={(e) => {
          if (
            active &&
            !window.confirm(`Disable login for ${investorName}? They are signed out and cannot sign in until you enable it again.`)
          ) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={investorId} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <button type="submit" disabled={pending} className={active ? dangerButton : primaryButton}>
          {pending ? "Saving…" : active ? "Disable login" : "Enable login"}
        </button>
      </form>
      <ActionMessage state={state} />
    </div>
  );
}

function TemporaryPassword({ investorId, investorName, hasPassword, minPasswordLength }: Props) {
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [state, formAction, pending] = useActionState<TemporaryPasswordState, FormData>(
    setInvestorTemporaryPasswordAction,
    {},
  );
  const baseId = useId();
  const passwordId = `${baseId}-password`;
  const confirmId = `${baseId}-confirm`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const fieldError = state.status === "error" ? state.fieldError : undefined;
  const describedBy = fieldError ? `${hintId} ${errorId}` : hintId;

  return (
    <div className="py-6">
      <h3 className="text-sm font-semibold text-slate-900">Temporary password</h3>
      <p className="mt-1 text-sm text-slate-600">
        {hasPassword ? "Reset the password: " : "Set a first password: "}
        you choose a temporary password and give it to {investorName}. They must choose a new password when they next sign
        in.
      </p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={`mt-3 ${secondaryButton}`}>
          Set temporary password
        </button>
      ) : (
        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={investorId} />
          <div>
            <label htmlFor={passwordId} className="text-sm font-semibold text-slate-900">
              Temporary password
            </label>
            <input
              id={passwordId}
              name="password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              autoCapitalize="none"
              spellCheck={false}
              required
              minLength={minPasswordLength}
              maxLength={200}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={describedBy}
              className={inputClass(fieldError)}
            />
            <p id={hintId} className="mt-1.5 text-xs text-slate-500">
              At least {minPasswordLength} characters. Setting it replaces any current password, cancels any setup link and
              signs {investorName} out.
            </p>
          </div>
          <div>
            <label htmlFor={confirmId} className="text-sm font-semibold text-slate-900">
              Confirm temporary password
            </label>
            <input
              id={confirmId}
              name="confirm"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={200}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? errorId : undefined}
              className={inputClass(fieldError)}
            />
            {fieldError && (
              <p id={errorId} className="mt-1.5 text-xs font-medium text-red-700">
                {fieldError}
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-900 focus:ring-blue-700"
            />
            Show passwords
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={primaryButton}>
              {pending ? "Saving…" : "Set temporary password"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setShow(false);
              }}
              className={secondaryButton}
            >
              {state.status === "saved" ? "Done" : "Cancel"}
            </button>
          </div>
        </form>
      )}
      {(state.status === "saved" || (state.message && !fieldError)) && <ActionMessage state={state} />}
    </div>
  );
}

function SetupLink({ investorId, investorName, active, hasPassword }: Props) {
  const [state, formAction, pending] = useActionState<SetupLinkState, FormData>(createInvestorSetupLinkAction, {});
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const linkId = useId();
  // Built in the browser from this site's address; the token is shown only once.
  const url =
    state.token && typeof window !== "undefined"
      ? `${window.location.origin}/setup?token=${encodeURIComponent(state.token)}`
      : null;

  async function copy() {
    if (!url || !state.token) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(state.token);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
      inputRef.current?.select();
    }
  }

  return (
    <div className="pt-6">
      <h3 className="text-sm font-semibold text-slate-900">Setup link</h3>
      <p className="mt-1 text-sm text-slate-600">
        A one-time link {investorName} opens to choose {hasPassword ? "a new" : "their own"} password. It expires after{" "}
        {SETUP_LINK_HOURS} hours. Creating a new link replaces any earlier one.
      </p>
      {!active && (
        <p className="mt-2 text-sm font-medium text-amber-800">Login is disabled. Enable it so {investorName} can sign in.</p>
      )}
      <form action={formAction} className="mt-3">
        <input type="hidden" name="id" value={investorId} />
        <button type="submit" disabled={pending} className={secondaryButton}>
          {pending ? "Creating…" : url ? "Create another setup link" : "Create setup link"}
        </button>
      </form>
      {state.status === "error" && <ActionMessage state={state} />}
      {url && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <label htmlFor={linkId} className="block text-sm font-semibold text-emerald-900">
            Setup link for {investorName}
          </label>
          <p className="mt-0.5 text-xs text-emerald-900">
            Copy it now and send it to {investorName}. It is shown only once.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              ref={inputRef}
              id={linkId}
              type="text"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="block w-full min-w-0 rounded-lg border border-emerald-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-700/30"
            />
            <button type="button" onClick={copy} className={primaryButton}>
              {copiedToken === state.token ? "Copied" : "Copy"}
            </button>
          </div>
          <p role="status" className="mt-2 text-xs text-emerald-900">
            {copiedToken === state.token
              ? "Link copied to the clipboard."
              : copyFailed
                ? "Copying failed. The link is selected: press Ctrl+C (or Cmd+C) to copy it."
                : ""}
          </p>
        </div>
      )}
    </div>
  );
}

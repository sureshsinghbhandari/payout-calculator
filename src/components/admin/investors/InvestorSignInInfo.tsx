"use client";

import { useState, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** Where and how the investor signs in, with a copy button for sharing. */
export function InvestorSignInInfo({
  username,
  hasPassword,
  active,
}: {
  username: string;
  hasPassword: boolean;
  active: boolean;
}) {
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const portalUrl = `${origin}/portal`;
  const [copied, setCopied] = useState(false);

  const instructions = `Investor sign-in: ${portalUrl}\nUsername: ${username}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(instructions);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const ready = active && hasPassword;

  return (
    <div className={`mb-5 rounded-xl border p-4 text-sm ${ready ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
      <p className={`font-semibold ${ready ? "text-emerald-900" : "text-amber-900"}`}>
        {ready
          ? "This investor can sign in."
          : !active
            ? "This investor cannot sign in: login is disabled."
            : "This investor cannot sign in yet: they have no password. Set a temporary password or create a setup link below."}
      </p>
      <dl className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        <dt className="text-slate-600">Sign-in page</dt>
        <dd className="break-all font-medium text-slate-900">{origin ? portalUrl : "/portal"}</dd>
        <dt className="text-slate-600">Username</dt>
        <dd className="font-medium text-slate-900">{username}</dd>
      </dl>
      <button
        type="button"
        onClick={copy}
        className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
      >
        {copied ? "Copied" : "Copy sign-in details"}
      </button>
      <p className="mt-2 text-xs text-slate-600">
        Share the password separately (the temporary password you set, or the setup link).
      </p>
    </div>
  );
}

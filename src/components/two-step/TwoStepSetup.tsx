"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useId, useState } from "react";
import type { TwoStepConfirmState } from "@/lib/two-step";
import { primaryButton, secondaryButton, successNotice } from "./styles";

// "Continue" and "Done" wait for the checkbox, not for the server.
const doneButton = primaryButton.replace("disabled:cursor-wait", "disabled:cursor-not-allowed");
import { CodeField, SubmitButton } from "./ui";

interface Props {
  /** The secret as text (groups of four) and its QR code (path and size from lib/qr). */
  secretText: string;
  qrPath: string;
  qrSize: number;
  confirmAction: (state: TwoStepConfirmState, formData: FormData) => Promise<TwoStepConfirmState>;
  cancelAction: () => Promise<void>;
  /** Where "Continue" goes once it is on (e.g. into the admin after a required setup). Without it the page reloads. */
  doneHref?: string;
}

/** Scan the QR code (or type the key), confirm with a code, then save the recovery codes. */
export function TwoStepSetup({ secretText, qrPath, qrSize, confirmAction, cancelAction, doneHref }: Props) {
  const [state, formAction, pending] = useActionState<TwoStepConfirmState, FormData>(confirmAction, { status: "idle" });
  const id = useId();

  if (state.status === "enabled" && state.recoveryCodes) {
    return <RecoveryCodes codes={state.recoveryCodes} doneHref={doneHref} />;
  }

  return (
    <div>
      <ol className="space-y-6">
        <li>
          <h3 className="text-sm font-semibold text-slate-900">1. Scan this code with your authenticator app</h3>
          <p className="mt-1 text-sm text-slate-600">
            On your phone, open an authenticator app (for example Google Authenticator, Microsoft Authenticator or
            1Password), add an account and scan the code.
          </p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
            <svg
              role="img"
              aria-label="QR code to add this account to your authenticator app"
              viewBox={`0 0 ${qrSize} ${qrSize}`}
              shapeRendering="crispEdges"
              className="h-48 w-48 shrink-0 rounded-lg border border-slate-200 bg-white"
            >
              <rect width={qrSize} height={qrSize} fill="#ffffff" />
              <path d={qrPath} fill="#0f172a" />
            </svg>
            <div className="min-w-0 text-sm text-slate-600">
              <p>Cannot scan it? Enter this key in the app instead:</p>
              <p className="mt-2 break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-base tracking-wider text-slate-900">
                {secretText}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                If the app asks, choose a time-based code. Keep this key private.
              </p>
            </div>
          </div>
        </li>
        <li>
          <h3 className="text-sm font-semibold text-slate-900">2. Enter the code the app shows</h3>
          <form action={formAction} className="mt-3 max-w-sm space-y-4">
            <CodeField
              id={`${id}-code`}
              error={state.status === "error" ? state.message : undefined}
              allowRecovery={false}
              label="6-digit code"
            />
            <p role="alert" className="sr-only">
              {state.status === "error" ? state.message : ""}
            </p>
            <button type="submit" disabled={pending} className={primaryButton}>
              {pending ? "Checking…" : "Turn on two-step sign-in"}
            </button>
          </form>
        </li>
      </ol>
      <form action={cancelAction} className="mt-6 border-t border-slate-200 pt-4">
        <SubmitButton label="Cancel setup" pendingLabel="Cancelling…" className={secondaryButton} />
      </form>
    </div>
  );
}

/** The recovery codes, shown once right after two-step sign-in is turned on. */
function RecoveryCodes({ codes, doneHref }: { codes: string[]; doneHref?: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [copy, setCopy] = useState<"copied" | "failed" | null>(null);
  const headingId = useId();
  const checkId = useId();
  const textFile = `Recovery codes for two-step sign-in (Investment Payout Calculator).\nEach code works once.\n\n${codes.join("\n")}\n`;

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <section aria-labelledby={headingId}>
      <p role="status" className={successNotice}>
        Two-step sign-in is on. From now on you enter a code from your app after your password.
      </p>
      <h3 id={headingId} className="mt-6 text-base font-semibold text-slate-900">
        Save your recovery codes
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        If you lose your phone, sign in with one of these codes instead. Each code works once. Keep them somewhere safe,
        like a password manager or on paper.{" "}
        <strong className="font-semibold text-slate-900">They are shown only now.</strong>
      </p>
      <ul className="mt-4 grid max-w-md grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-base text-slate-900">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={copyCodes} className={secondaryButton}>
          {copy === "copied" ? "Copied" : "Copy codes"}
        </button>
        <a
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(textFile)}`}
          download="recovery-codes.txt"
          className={secondaryButton}
        >
          Download as a text file
        </a>
      </div>
      <p role="status" aria-live="polite" className="mt-2 text-xs text-slate-600">
        {copy === "copied" && "Codes copied to the clipboard."}
        {copy === "failed" && "Copying is blocked in this browser. Select the codes and copy them, or download them."}
      </p>
      <label htmlFor={checkId} className="mt-5 flex items-start gap-2 text-sm text-slate-800">
        <input
          id={checkId}
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-900 focus:ring-blue-700"
        />
        I have saved my recovery codes
      </label>
      <div className="mt-4">
        {doneHref ? (
          saved ? (
            <Link href={doneHref} className={doneButton}>
              Continue
            </Link>
          ) : (
            <button type="button" disabled className={doneButton}>
              Continue
            </button>
          )
        ) : (
          <button type="button" disabled={!saved} onClick={() => router.refresh()} className={doneButton}>
            Done
          </button>
        )}
      </div>
    </section>
  );
}

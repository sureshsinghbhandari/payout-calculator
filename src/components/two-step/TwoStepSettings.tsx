import { formatIsoDate } from "@/lib/format";
import type { TwoStepConfirmState, TwoStepDisableState } from "@/lib/two-step";
import { primaryButton, successNotice, warningNotice } from "./styles";
import { TwoStepDisableForm } from "./TwoStepDisableForm";
import { TwoStepSetup } from "./TwoStepSetup";
import { SubmitButton } from "./ui";

export interface TwoStepActions {
  start: () => Promise<void>;
  cancelSetup: () => Promise<void>;
  confirm: (state: TwoStepConfirmState, formData: FormData) => Promise<TwoStepConfirmState>;
  disable: (state: TwoStepDisableState, formData: FormData) => Promise<TwoStepDisableState>;
}

interface Props {
  username: string;
  enabled: boolean;
  /** ISO timestamp it was turned on. */
  enabledAt: string | null;
  recoveryCodesLeft: number;
  /** The pending setup to scan (see lib/server/two-step.ts), or null. */
  setup: { secretText: string; qrPath: string; qrSize: number } | null;
  /** Whether turning it off warns that setup is required again right away (not currently used for any role). */
  required: boolean;
  actions: TwoStepActions;
  /** Where "Continue" goes after turning it on; without it the page reloads. */
  doneHref?: string;
  /** Just turned off (shown once, from the address). */
  justTurnedOff?: boolean;
  /** Recovery codes left, after signing in with one (shown once, from the address). */
  signedInWithRecovery?: number | null;
}

/**
 * Two-step sign-in section of My account (admins) and Sign-in security
 * (investors): turn it on (scan, confirm, save recovery codes) or off.
 */
export function TwoStepSettings({
  username,
  enabled,
  enabledAt,
  recoveryCodesLeft,
  setup,
  required,
  actions,
  doneHref,
  justTurnedOff,
  signedInWithRecovery,
}: Props) {
  return (
    <div className="space-y-5">
      {signedInWithRecovery != null && enabled && (
        <p role="status" className={warningNotice}>
          You signed in with a recovery code. You have {signedInWithRecovery} left. If you lost your phone, turn
          two-step sign-in off below and set it up again on your new phone: you get new recovery codes.
        </p>
      )}
      {justTurnedOff && !enabled && (
        <p role="status" className={successNotice}>
          Two-step sign-in is off.
          {required ? " As a Master Admin, set it up again to continue." : ""}
        </p>
      )}

      {enabled ? (
        <>
          <p className="flex items-start gap-2 text-sm text-slate-800">
            <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
            <span>
              <span className="font-semibold">On</span>
              {enabledAt && <> since {formatIsoDate(enabledAt.slice(0, 10))}</>}. After your password, you enter a code
              from your authenticator app. {recoveryCodesLeft} of 10 recovery codes left.
            </span>
          </p>
          {recoveryCodesLeft <= 3 && (
            <p className={warningNotice}>
              You are running out of recovery codes. To get new ones, turn two-step sign-in off and on again.
            </p>
          )}
          <TwoStepDisableForm
            action={actions.disable}
            username={username}
            note={
              required
                ? "Master Admins must use two-step sign-in: after turning it off you are asked to set it up again straight away, for example on a new phone."
                : "To move to a new phone, turn it off and set it up again."
            }
          />
        </>
      ) : setup ? (
        <TwoStepSetup
          {...setup}
          confirmAction={actions.confirm}
          cancelAction={actions.cancelSetup}
          doneHref={doneHref}
        />
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {required ? "" : "Two-step sign-in is off. Turn it on for extra protection. "}
            After your password, you enter a 6-digit code from an authenticator app on your phone, so a stolen password
            alone is not enough to sign in.
          </p>
          <form action={actions.start}>
            <SubmitButton label="Set up two-step sign-in" pendingLabel="Starting…" className={primaryButton} />
          </form>
        </>
      )}
    </div>
  );
}

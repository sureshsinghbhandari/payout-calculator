/**
 * Two-step sign-in: form states shared by the admin and portal server actions
 * and the forms in components/two-step. The codes and secrets themselves are
 * handled in lib/server/two-step.ts.
 */

/** The code step of signing in. */
export interface TwoStepCodeState {
  error?: string;
}

/** Confirming a new setup with a code. On success the recovery codes are returned once. */
export interface TwoStepConfirmState {
  status: "idle" | "error" | "enabled";
  message?: string;
  recoveryCodes?: string[];
}

/** Turning two-step sign-in off (needs the current password and a code). */
export interface TwoStepDisableState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<"current" | "code", string>>;
}

/** A Master Admin resetting someone else's two-step sign-in. */
export interface TwoStepResetState {
  status: "idle" | "ok" | "error";
  message?: string;
}

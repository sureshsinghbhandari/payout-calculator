/** Shared styles and formatting for the user management and setup-link screens. */

export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-60";

export const dangerButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-60";

export function inputClass(invalid: boolean): string {
  return `mt-1.5 block w-full rounded-lg border bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm focus:outline-none focus:ring-2 ${
    invalid ? "border-red-600 focus:ring-red-600/30" : "border-slate-300 focus:border-blue-700 focus:ring-blue-700/30"
  }`;
}

export const labelClass = "block text-sm font-semibold text-slate-900";

/** ISO timestamp as e.g. "Oct 28, 2026, 3:15 PM EDT" (Eastern Time). */
export { formatTimestamp } from "@/lib/time";

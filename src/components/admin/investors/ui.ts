/** Class names shared by the investors admin pages (same look as the rest of the admin). */
export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60";

export const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-wait disabled:opacity-60";

export const dangerButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-wait disabled:opacity-60";

export const textLink = "font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950";

export const successNotice =
  "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800";

export const errorNotice = "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800";

export function inputClass(error?: string): string {
  return `mt-1.5 block w-full rounded-lg border bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm focus:outline-none focus:ring-2 ${
    error ? "border-red-600 focus:ring-red-600/30" : "border-slate-300 focus:border-blue-700 focus:ring-blue-700/30"
  }`;
}

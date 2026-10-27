import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

/** Friendly 404 page, also shown at the site root. */
export default function NotFound() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span
          aria-hidden="true"
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-900 text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
        </span>
        <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-blue-900">404</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">This page isn&apos;t available</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          There&apos;s nothing at this address. If someone sent you a link, please check it and try again, or contact
          the person who shared it.
        </p>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

// DRAFT WORDING — have this reviewed by a lawyer before go-live. This page was
// written by the app's developers to plainly describe what the app actually
// does today; it is not legal advice and has not been reviewed by one.

export const metadata: Metadata = {
  title: "Privacy Notice | Investment Payout Calculator",
  description: "What personal data this app collects, why, how long it is kept, and how to ask for a copy or deletion.",
};

const h2 = "mt-10 text-xl font-semibold text-slate-900";
const p = "mt-3 text-base leading-relaxed text-slate-700";
const li = "mt-1 leading-relaxed";
const link = "font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950";

/**
 * Public, unauthenticated privacy notice. Linked from the inquiry form and
 * the investor portal footer. Plain English, matching the tone of
 * disclaimer.ts and the acknowledgement email — not legalese, but a true
 * description of what this app collects and stores, re-checked against the
 * code rather than assumed.
 */
export default function PrivacyPage() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-900 text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <rect x="4" y="3" width="16" height="18" rx="2" />
              <path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15v2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="min-w-0 truncate text-base font-semibold text-slate-900">Investment Payout Calculator</span>
          <nav className="ml-auto flex shrink-0 gap-4 text-sm">
            <Link href="/inquiries" className={link}>
              Calculator
            </Link>
            <Link href="/portal" className={link}>
              Investor portal
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Privacy Notice</h1>
        <p className={p}>
          This page explains what personal information Investment Payout Calculator collects, why, how long we keep
          it, and what you can do about it. It covers everyone who uses this site: people who just use the
          calculator, people who send us an inquiry, and investors who sign in to the portal.
        </p>

        <h2 className={h2}>What we collect</h2>
        <p className={p}>Using the calculator on its own does not store anything about you.</p>
        <p className={p}>The amount, dates and terms you choose are sent to our server only to work out the payout schedule, and are not saved.</p>

        <p className={p}>If you send an inquiry, we store:</p>
        <ul className="ml-5 list-disc">
          <li className={li}>Your name, and your email address and/or phone number.</li>
          <li className={li}>Any message you write to us.</li>
          <li className={li}>
            How you say you found us, and, if relevant, which webinar you mean or who referred you.
          </li>
          <li className={li}>The investment plan (amount, dates and terms) you were looking at when you sent the inquiry.</li>
          <li className={li}>That you agreed to this notice, and when.</li>
        </ul>

        <p className={p}>If your inquiry becomes an investment and you get portal sign-in, we also store:</p>
        <ul className="ml-5 list-disc">
          <li className={li}>A username and a password. We never store your actual password, only a one-way scrambled
            version of it that cannot be reversed. If you turn on two-step sign-in, the authenticator secret is stored
            encrypted, and recovery codes are stored as one-way scrambled versions too.
          </li>
          <li className={li}>
            Your bank details for payouts, stored encrypted. Day to day, our team can only see the last 4 digits of
            your account number; viewing the full number is logged.
          </li>
          <li className={li}>The investments and payments our team records for you, and documents our team shares with you.</li>
          <li className={li}>Any changes to your contact or bank details you ask for in the portal, while we review them.</li>
          <li className={li}>Requests you make for a copy of your data or for your account to be deleted (see below).</li>
        </ul>

        <p className={p}>
          For everyone with an inquiry or an account, we also keep a log of account activity — things like sign-ins,
          status changes, and who viewed or changed what — so we can keep the app secure and look into problems if
          they come up.
        </p>

        <h2 className={h2}>Why we collect it</h2>
        <p className={p}>
          To respond to your inquiry, to administer your investment and payouts if you become an investor, to keep
          accounts and sign-ins secure, and to keep the records we need for our own accounting and legal obligations.
        </p>

        <h2 className={h2}>Who sees it</h2>
        <p className={p}>
          We do not sell your personal information, ever. It is seen by our own team, so they can respond to you and
          administer your investment, and by the service providers that run the app for us (for example, where the
          app is hosted and stored, and the service that delivers our emails) — only as needed to provide the
          service, never for their own purposes.
        </p>

        <h2 className={h2}>Cookies and local storage</h2>
        <p className={p}>
          We only use a cookie to keep you signed in to the admin area or the investor portal once you sign in. It is
          not used to track you, it is not shared with advertisers, and we do not use any analytics or third-party
          tracking cookies on this site.
        </p>

        <h2 className={h2}>How long we keep it</h2>
        <p className={p}>
          We keep inquiry and investor records for as long as we need them to administer your relationship with us
          and to meet our legal and accounting obligations, and remove or anonymize them once that is no longer the
          case. Activity logs are kept by month for our own accountability.
        </p>

        <h2 className={h2}>Your choices: a copy of your data, or deletion</h2>
        <p className={p}>You can ask us for a copy of the personal data we hold about you, or ask us to delete your account.</p>
        <p className={p}>
          <strong className="font-semibold text-slate-900">If you are an investor:</strong> sign in to the{" "}
          <Link href="/portal/details" className={link}>
            portal
          </Link>
          , open Your details, and use the Privacy section to send either request, with an optional note. A Master
          Admin reviews every request and will follow up with you; you can see its status there, and withdraw it at
          any time before it is resolved. There is no automatic export or deletion — our team handles each request by
          hand (for example, by emailing you the data, or removing your account) and then marks it fulfilled.
        </p>
        <p className={p}>
          <strong className="font-semibold text-slate-900">If you are not an investor</strong> (you only sent an
          inquiry, or you are just using the calculator): email us at{" "}
          <a href="mailto:privacy@investmentpayoutcalculator.example" className={link}>
            privacy@investmentpayoutcalculator.example
          </a>{" "}
          with your name and, if you have it, your inquiry reference. We will handle your request by hand and get
          back to you.
        </p>

        <h2 className={h2}>Questions</h2>
        <p className={p}>
          If you have any question about this notice or about the information we hold about you, email{" "}
          <a href="mailto:privacy@investmentpayoutcalculator.example" className={link}>
            privacy@investmentpayoutcalculator.example
          </a>
          .
        </p>

        <h2 className={h2}>Changes to this notice</h2>
        <p className={p}>We may update this page as the app changes. Please check back from time to time.</p>

        <p className="mt-10 text-sm">
          <Link href="/inquiries" className={link}>
            <span aria-hidden="true">← </span>Back to the calculator
          </Link>
        </p>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-6 text-xs leading-relaxed text-slate-500 sm:px-6">
          Investment Payout Calculator.
        </div>
      </footer>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY, isPlaceholder } from "@/lib/company";

// ATTORNEY REVIEW STILL REQUIRED. This notice was drafted to describe what the
// app actually does (re-checked against the code) and to cover the usual US
// disclosures (state privacy laws, financial records, e-signature, security).
// It is not legal advice. Before go-live, fill in lib/company.ts and have a
// licensed attorney confirm which laws apply to the company. See
// docs/legal-review.md for the points to raise.

export const metadata: Metadata = {
  title: "Privacy Notice | Investment Payout Calculator",
  description: "What personal data this app collects, why, who sees it, how long it is kept, and how to ask for a copy, a correction or deletion.",
};

/** Change this date whenever the notice changes. */
const LAST_UPDATED = "November 1, 2026";

const h2 = "mt-10 text-xl font-semibold text-slate-900";
const p = "mt-3 text-base leading-relaxed text-slate-700";
const li = "mt-1 leading-relaxed";
const link = "font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950";

/** The privacy mailbox as a mail link, or as plain text while it is still a placeholder. */
function PrivacyEmail() {
  if (isPlaceholder(COMPANY.privacyEmail)) return <span className="font-semibold text-slate-900">{COMPANY.privacyEmail}</span>;
  return (
    <a href={`mailto:${COMPANY.privacyEmail}`} className={link}>
      {COMPANY.privacyEmail}
    </a>
  );
}

/**
 * Public, unauthenticated privacy notice. Linked from the inquiry form and
 * the investor portal footer. Plain English, matching the tone of
 * disclaimer.ts and the acknowledgement email, but a true description of what
 * this app collects and stores, re-checked against the code rather than
 * assumed.
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
        <p className="mt-2 text-sm text-slate-500">Last updated {LAST_UPDATED}</p>
        <p className={p}>
          This notice explains what personal information is collected through the Investment Payout Calculator site and
          investor portal, why, who sees it, how long it is kept, and what you can do about it. It covers everyone who
          uses the site: people who just use the calculator, people who send an inquiry, and investors who sign in to the
          portal.
        </p>

        <h2 className={h2}>Who we are</h2>
        <p className={p}>
          The site is run by {COMPANY.legalName}, {COMPANY.address} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). We decide why
          and how your personal information is used, so we are responsible for it. You can reach us about anything in
          this notice at <PrivacyEmail />.
        </p>

        <h2 className={h2}>What we collect</h2>
        <p className={p}>Using the calculator on its own does not store anything about you.</p>
        <p className={p}>
          The amount, dates and terms you choose are sent to our server only to work out the payout schedule, and are
          not saved.
        </p>

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
          <li className={li}>
            A username and a password. We never store your actual password, only a one-way scrambled version of it that
            cannot be reversed. If you turn on two-step sign-in, the authenticator secret is stored encrypted, and
            recovery codes are stored as one-way scrambled versions too.
          </li>
          <li className={li}>
            Your bank details for payouts, stored encrypted. Day to day, our team can only see the last 4 digits of your
            account number; viewing the full number is logged.
          </li>
          <li className={li}>
            The investments and payments our team records for you, and the documents we share with you or collect from
            you, such as your investment agreement and the signed copies.
          </li>
          <li className={li}>Any changes to your contact or bank details you ask for in the portal, while we review them.</li>
          <li className={li}>Requests you make for a copy of your data, a correction or deletion (see below).</li>
        </ul>

        <p className={p}>
          For everyone with an inquiry or an account, we also keep a log of account activity, such as sign-ins, status
          changes, and who viewed or changed what, so we can keep the app secure and look into problems if they come up.
          Our hosting provider also records basic technical details of each visit (such as your IP address, browser and
          the page requested) in its server logs for security and reliability.
        </p>
        <p className={p}>
          Some of this is sensitive personal information: your bank account details and, if we ask for identity
          documents to meet anti-money-laundering rules, the identity numbers and documents you give us. We use sensitive
          information only to run your investment and meet our legal duties, never to profile you.
        </p>
        <p className={p}>
          We collect this information from you directly, from our team&apos;s records of your investment, and from the
          devices you use to visit the site. We do not buy personal information about you from anyone else.
        </p>

        <h2 className={h2}>Why we use it</h2>
        <ul className="ml-5 mt-3 list-disc">
          <li className={li}>To respond to your inquiry.</li>
          <li className={li}>To set up and administer your investment, pay your earnings and send you statements and notices.</li>
          <li className={li}>To prepare, send and keep the agreements you sign.</li>
          <li className={li}>To keep accounts and sign-ins secure, and to detect and prevent fraud and misuse.</li>
          <li className={li}>
            To keep the records we need for our accounting and tax reporting, and to meet legal duties such as
            anti-money-laundering and sanctions rules.
          </li>
          <li className={li}>To answer your privacy requests.</li>
        </ul>

        <h2 className={h2}>Who sees it</h2>
        <p className={p}>
          We do not sell your personal information, and we do not share it for advertising. We also do not use it to
          make automated decisions about you. It is seen by:
        </p>
        <ul className="ml-5 list-disc">
          <li className={li}>
            Our own team, according to their role, so they can respond to you and administer your investment. Staff in
            the sales role never see earnings rates.
          </li>
          <li className={li}>
            Service providers that run the app for us, only as needed to provide their service and never for their own
            purposes: our website host and file storage provider (Vercel), our email provider (Google Gmail or Resend),
            and the electronic signature service we use to send agreements for signature (BoldSign).
          </li>
          <li className={li}>
            Professional advisers such as our accountants and lawyers, and tax authorities, regulators, courts and law
            enforcement where the law requires or allows it.
          </li>
          <li className={li}>
            A buyer or successor, if our business is sold or reorganized, who must keep using your information as
            described here.
          </li>
        </ul>

        <h2 className={h2}>Cookies and visitor statistics</h2>
        <p className={p}>
          We only use a cookie to keep you signed in to the admin area or the investor portal once you sign in. It is
          not used to track you and it is not shared with advertisers. We do not use advertising or third-party tracking
          cookies. We may use cookie-free visitor statistics (Vercel Web Analytics and Speed Insights) that count visits
          and measure page speed without identifying you or following you to other sites. Because we do not track you
          across sites, there is nothing for a &ldquo;Do Not Track&rdquo; or Global Privacy Control signal to switch
          off.
        </p>

        <h2 className={h2}>How we protect it</h2>
        <p className={p}>
          Connections to the site are encrypted. Passwords and recovery codes are stored only as one-way scrambled
          values, bank details and authenticator secrets are stored encrypted, access is limited by role, and sensitive
          actions are logged. No system is perfectly secure, so we cannot promise absolute security. If a breach affects
          your information, we will tell you and the authorities as the law requires.
        </p>

        <h2 className={h2}>How long we keep it</h2>
        <p className={p}>
          We keep inquiry records for as long as we need them to follow up with you. We keep investor records for as
          long as you have an investment with us and afterwards for as long as tax, accounting and anti-money-laundering
          record-keeping laws require us to keep them, which can be several years after the relationship ends. After
          that we delete or anonymize them. Activity logs are kept by month for our own accountability.
        </p>

        <h2 className={h2}>Your choices and rights</h2>
        <p className={p}>You can ask us to:</p>
        <ul className="ml-5 list-disc">
          <li className={li}>
            tell you what personal information we hold about you and give you a copy of it (&ldquo;right to know&rdquo;
            and access);
          </li>
          <li className={li}>correct information that is wrong or out of date;</li>
          <li className={li}>
            delete your information and close your account. We may have to keep some records (for example, payment and
            tax records) for as long as the law requires, and we will tell you if so;
          </li>
          <li className={li}>
            stop selling or sharing your information. We do neither, so there is nothing to opt out of.
          </li>
        </ul>
        <p className={p}>
          Residents of California and some other states have these rights set out in their state privacy laws, and you
          will not be treated worse for using them. You may ask someone else, such as an agent, to make a request for you;
          we will ask for proof that they may.
        </p>
        <p className={p}>
          <strong className="font-semibold text-slate-900">If you are an investor:</strong> sign in to the{" "}
          <Link href="/portal/details" className={link}>
            portal
          </Link>
          , open Your details, and use the Privacy section to send a request for a copy of your data or for your account
          to be deleted, with an optional note. To correct your contact or bank details, use the same page. A Master
          Admin reviews every request and will follow up with you; you can see its status there, and withdraw it at any
          time before it is resolved. There is no automatic export or deletion: our team handles each request by hand
          (for example, by emailing you the data, or removing your account) and then marks it fulfilled.
        </p>
        <p className={p}>
          <strong className="font-semibold text-slate-900">If you are not an investor</strong> (you only sent an
          inquiry, or you are just using the calculator): email us at <PrivacyEmail /> with your name and, if you have
          it, your inquiry reference.
        </p>
        <p className={p}>
          We will confirm your request within 10 business days and respond within 45 days of receiving it; if we need
          more time, we will tell you why and take no more than another 45 days. To protect you, we may need to confirm
          it is really you before we share or delete anything. If you disagree with how we handled a request, you can
          reply and ask us to look again, and you may also contact your state attorney general.
        </p>

        <h2 className={h2}>Children</h2>
        <p className={p}>
          This site is for adults. We do not knowingly collect information from anyone under 18, and we will delete it if
          we learn that we have.
        </p>

        <h2 className={h2}>Where your information is processed</h2>
        <p className={p}>
          Our service providers may store and process information on servers in the United States or other countries.
          Where they do, we require them to protect it as this notice describes.
        </p>

        <h2 className={h2}>Changes to this notice</h2>
        <p className={p}>
          We may update this notice as the app or the law changes. The date at the top shows when it last changed. If a
          change materially affects how we use your information, we will tell investors by email or in the portal before
          it takes effect.
        </p>

        <h2 className={h2}>Contact us</h2>
        <p className={p}>
          Questions or requests about this notice or about the information we hold about you: <PrivacyEmail />, or write
          to {COMPANY.legalName}, {COMPANY.address}.
        </p>

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

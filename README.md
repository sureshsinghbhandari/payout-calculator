# Investment Payout Calculator

A public web calculator that shows the payout schedule for a fixed-term investment.
Visitors pick an investment amount from a list, a planned investment date, a term, a
payout term and a payout type. They get a payout-by-payout table with totals,
comparisons with other scenarios, an Excel download, and can send an inquiry.

Behind it is an admin area with named users and roles (Master Admin, Sales Admin) for
managing inquiries, investors and the interest rates, and an investor portal where
investors sign in to see their investments.

| Who | Address |
| --- | --- |
| Visitors: calculator and inquiries | https://payout-calculator-steel.vercel.app/inquiries |
| Investors: sign in | https://payout-calculator-steel.vercel.app/portal |
| Staff: admin | https://payout-calculator-steel.vercel.app/admin |

The site root (`/`) intentionally shows a friendly "page not found" (404). The old
`/investor` address redirects to `/portal`.

Interest rates are never shown to visitors or investors.

## Tech stack

- Next.js (App Router, Cache Components) with TypeScript
- Tailwind CSS
- Server Actions for the calculation and the admin page
- Vercel Blob (private store) for the interest rates
- ExcelJS for the Excel download, loaded only when the button is clicked
- Vitest for tests
- Vercel for hosting

## Project layout

| Path | Purpose |
| --- | --- |
| `src/lib/config.ts` | Defaults: starting rates, amounts, terms, form defaults, business-day offset |
| `src/lib/payout.ts` | Calculation engine, investment-date and rate validation |
| `src/lib/dates.ts` | Date helpers and business days (Monday to Friday) |
| `src/lib/scenarios.ts` | Comparison scenarios, and removing rates from results |
| `src/lib/rates.ts` | Rate table validation and the stored rates format |
| `src/lib/quote.ts` | Server-side validation of calculation requests |
| `src/lib/excel.ts` | Excel workbook export |
| `src/lib/disclaimer.ts` | Disclaimer text |
| `src/lib/server/rates-store.ts` | Reads and saves rates in Vercel Blob (server only) |
| `src/lib/server/session.ts`, `admin-auth.ts` | Admin password check and session cookie (server only) |
| `src/app/actions.ts` | Public Server Action that calculates a quote |
| `src/app/admin/` | Admin page and its Server Actions |
| `src/components/` | Calculator form, results, comparisons, admin forms |
| `src/lib/*.test.ts` | Automated tests |

## How it works

- **Labels:** Investment amount (a list), Planned investment date, Term locked (1 or 2 years),
  Payout term (Quarterly, Half-Yearly or Yearly) and Payout type.
- **Defaults:** $100,000, 2 years, Yearly payouts, Interest Only, invested today. Reset
  returns to these.
- **Planned investment date:** interest starts on the next business day after the
  planned investment date. Business days are Monday to Friday; public holidays are not taken into account.
  Payouts then fall every 3, 6 or 12 months, counted from the interest start date, and
  are not moved if they land on a weekend.
- **Rates:** each payout term has its own annual rate. The browser never receives
  the rates. When a visitor clicks Calculate Payout, the server reads the current rates,
  calculates the schedule and the comparison scenarios, and sends back only the results.
- **Scenario comparisons:** the results page and the Excel file compare the selection
  with longer payout terms (same payout type, each at its own rate) and with the other
  payout type (same frequency and rate). Quarterly compares Half-Yearly and Yearly;
  Half-Yearly compares Yearly; Yearly has no longer period.
- **Excel workbook sheets:** `Your Selection`, one `<Frequency> Payout` sheet per longer
  payout term, one sheet for the other payout type, and `Comparison`.

## Calculation rules

- Simple interest only. Interest is never compounded.
- Periods per year: Quarterly 4, Half-Yearly 2, Yearly 1.
- Total payouts = term in years x payouts per year.
- **Interest Only:** every payout is one period of interest on the original principal.
  The final payout adds the full principal. Total interest = principal x rate x years.
- **Interest and Principal:** principal is returned in equal installments. Each payout's
  interest = outstanding principal before that payout x rate / periods per year.
- Money is calculated in whole cents with integer math. Values are rounded half-up to
  the cent, and the final payout absorbs any rounding difference, so totals reconcile and
  the remaining principal ends at exactly $0.00.

## Admin users and roles

Admins sign in at `/admin` with a **username and password**.

| Role | Can do |
| --- | --- |
| **Master Admin** | Everything: inquiries (view, mark contacted, delete and restore, convert to investor), Deleted inquiries, Investors, Interest rates, Users. |
| **Sales Admin** | Inquiries only: view them and mark them contacted or new. They do not see interest rates. |

Starting users (created automatically the first time the admin area is used):

| Name | Username | Role |
| --- | --- | --- |
| Ashwin Patel | `apatel` | Master Admin |
| Suresh Bhandari | `sbhandari` | Sales Admin |

### Passwords

Nobody's password is stored in the code or the README. People set their own:

- **First Master Admin (apatel):** the first time, sign in as `apatel` with the
  `ADMIN_PASSWORD` value from Vercel. You are asked to choose your own password straight
  away; after that, `ADMIN_PASSWORD` no longer works for sign-in.
- **Everyone else:** a Master Admin opens **Settings (gear) > Users** and either
  - selects **Set temporary password** and types one (at least 12 characters). The
    person must choose their own password the first time they sign in, or
  - selects **Create setup link** and sends the one-time link (valid for 72 hours) to
    the person, who opens it and chooses a password.
- Anyone can change their own password under **Settings > My account**.
- Passwords are at least 12 characters and stored only as scrypt hashes. Changing a
  password signs out that person's other sessions.

### Managing users (Master Admin)

**Settings > Users** (`/admin/settings/users`): add users (name, username, role),
change roles, disable or enable users, set temporary passwords and create setup links.
There must always be at least one active Master Admin.

## Investors

1. When an inquiry is **Contacted**, a Master Admin selects **Convert to investor**.
2. The form is pre-filled from the inquiry (name, email, phone and the plan) and can be
   adjusted. The interest rate for the chosen payout term is fixed at that moment.
3. The investor is created with a username, and the inquiry is marked **Converted**.
4. On the investor's page (**Settings > Investors**), the Master Admin gives the investor
   a **temporary password** (the investor must change it at first sign-in) or a
   **setup link**. The Master Admin can reset an investor's password the same way at any
   time, edit contact details and username, and disable or enable their login.

### Investor portal

Investors sign in at `/portal` (the calculator page also has an **Investor login** button) with their username and password and see each
investment: amount, planned investment date, interest start date, term locked, payout
term and type, totals, the next payout, and the full payout schedule with each payout
marked Paid or Upcoming by its scheduled date. The interest rate is not shown.

## Managing interest rates (Master Admin)

1. Sign in at `/admin`, open **Settings (gear) > Interest rates**
   (`/admin/settings/rates`).
2. The rates are shown locked. Select **Unlock to edit** and enter **your own password**.
3. Change the Quarterly, Half-Yearly and Yearly rates (0% to 100%, up to 4 decimal
   places) and select **Save rates**. Saving locks the rates again; editing also locks by
   itself after 10 minutes, or when you select **Lock**.
4. New calculations use the saved rates immediately. Existing investors keep the rate
   fixed when they were converted. The page keeps a history of the last 20 saves.

Until the first save, the starting rates in `src/lib/config.ts`
(`DEFAULT_RATE_BY_FREQUENCY`: Quarterly 8%, Half-Yearly 9%, Yearly 10%) are used.

## Inquiries

- After calculating, visitors can select **Send inquiry**. The form shows their plan and
  asks for name, email, an optional phone number and an optional message.
- Admins see them at `/admin/inquiries` (the admin home page), newest first. Statuses:
  New, Contacted, Converted, Deleted.
- Delete (Master Admin) is a soft delete: the inquiry keeps its data, gets the status
  "deleted" and moves to **Deleted inquiries** (`/admin/inquiries/deleted`), where it
  can be restored.
- Spam protection: a hidden honeypot field, and at most 5 inquiries per client per hour.
- Email notifications are not set up yet.

## Audit log

Every action is recorded with who did it, what they did, the item it affected and the
time (UTC): admin and investor sign-ins (including failed attempts), password changes,
inquiries received, status changes, deletes and restores, conversions, investor and user
changes, and interest rate unlocks and changes (with the old and new rates). Master
Admins see it under **Settings > Audit log** (`/admin/settings/audit`), by month and by
category. Customer email responses will be added with the Gmail integration. Events are
stored as one private file per month in Vercel Blob.

## Upcoming features

**Settings > Upcoming features** (`/admin/settings/upcoming`, Master Admin) lists planned
work by area with Now / Next / Later priorities, starting with linking a Gmail account,
emailing inquiry acknowledgements with the reference number, and reading customer replies.
The list lives in `src/lib/roadmap.ts`.

## Temporary: permanent delete

For now, Master Admins can **Delete permanently** an inquiry that is already in Deleted
inquiries (recorded in the audit log). This is marked TEMPORARY in the code
(`inquiries.purge` permission, `purgeInquiry`, `purgeInquiryAction`) and should be
removed before go-live.

## Seminar deck

`docs/Investment-Plans-Seminar.pptx` and `.pdf`: a 6-slide deck for investor
seminars. It covers how it works, one slide each for Quarterly, Half-Yearly and Yearly
payouts (what $25,000, $50,000 and $100,000 pay over 1 and 2 years, Interest Only), and a
closing slide with the inquiry address, a QR code and the disclaimer. Speaker notes are
included. Figures use the production rates at the time it was made (8%, 9%, 10%); the
rates themselves are not shown.

To rebuild after a rate change: edit `RATES` in `docs/build-deck.cjs`, run it with
Node (it needs the `pptxgenjs` and `qrcode` packages), then make the PDF with
PowerPoint: `powershell -File docs/export-pdf.ps1 -Pptx <pptx> -Pdf <pdf> -ImageDir <folder>`.

## Data storage

Everything is stored as private JSON files in the Vercel Blob store
`payout-calculator-rates`: interest rates, inquiries (one file each), admin users and
investors. Production, preview deployments and local development use separate folders,
so testing never touches live data.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `ADMIN_SESSION_SECRET` | Random value, at least 32 characters, that signs all sign-in sessions. Required. |
| `ADMIN_PASSWORD` | One-time bootstrap password for the first Master Admin (`apatel`), at least 12 characters. Not used once apatel has set a personal password. |
| `BLOB_READ_WRITE_TOKEN` | Access to the private Blob store. Added automatically when the store was connected. |

Set a value with `npx vercel env add NAME production --sensitive` (you type the value),
then redeploy with `npx vercel deploy --prod`.

### Sign-in protection

- Sign-in, password changes and unlocking rates lock a client out for 15 minutes after
  5 wrong passwords (per server instance), with a 1-second wait after each wrong one.
- A Vercel Firewall rule, **Sign-in rate limit**, allows at most 20 POST requests per IP
  address per 5 minutes to `/admin` (admin sign-in), `/portal` (investor sign-in and
  password change) and `/setup` (setup links), counted together. An address that goes
  over is blocked from those requests for 15 minutes. Admin work on other pages (for
  example inquiries) does not count. The free (Hobby) plan allows one rate-limit rule,
  which is why the three pages share it. View or change it with
  `npx vercel firewall rules inspect "Sign-in rate limit"`, or in the Vercel dashboard
  under Firewall.
- Sessions are HTTP-only, SameSite=Strict, Secure cookies: `/admin` for admins and
  `/portal` for investors, valid for 8 hours.

For local development, put `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` in
`.env.development.local`, and run `npx vercel env pull .env.local` for the Blob token.
Both files are git-ignored.

## Local development

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Then open http://localhost:3000 (and http://localhost:3000/admin).

### Checks

```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm test            # Vitest tests
npm run build       # Production build
```

## Changing defaults

`src/lib/config.ts` holds the starting rates, the investment amount options, the default
amount, term, payout term and payout type, the accepted planned-investment-date
range, and `INTEREST_START_BUSINESS_DAYS` (how many business days after the investment
date interest starts). After a change, run the checks above and redeploy.

## Deploying updates

The site is hosted on Vercel as the `payout-calculator` project.

```bash
npx vercel login          # first time only
npx vercel deploy --prod
```

**Automatic deploys from GitHub:** connect the repository once in the Vercel dashboard
(Project Settings, then Git) or with `npx vercel git connect`. After that, every push to
`main` deploys to production.

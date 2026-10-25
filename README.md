# Investment Payout Calculator

A public, no-login web calculator that shows the payout schedule for a fixed-term
investment. Visitors pick an investment amount from a list, a planned investment date,
a term, a payout term and a payout type. They get a payout-by-payout table with totals, comparisons
with other scenarios, and an Excel download.

Interest rates are set by an admin on a password-protected admin page and are never
shown to visitors.

- **Live site:** https://payout-calculator-steel.vercel.app
- **Admin page:** https://payout-calculator-steel.vercel.app/admin

This is an illustrative calculator prototype. It does not collect payments, register
investors or store any visitor information.

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

## Managing interest rates (admin)

1. Open `/admin` on the live site and sign in with the admin password.
2. Change the Quarterly, Half-Yearly and Yearly rates (0% to 100%, up to 4 decimal
   places) and select **Save rates**.
3. New calculations use the saved rates immediately. The page keeps a history of the
   last 20 saves.

Until the first save, the starting rates in `src/lib/config.ts`
(`DEFAULT_RATE_BY_FREQUENCY`: Quarterly 8%, Half-Yearly 9%, Yearly 10%) are used.
Production uses its own rates file; preview deployments and local development use
separate files, so testing never changes the live rates.

## Admin setup

The admin page needs these environment variables in the Vercel project:

| Variable | Purpose |
| --- | --- |
| `ADMIN_PASSWORD` | The admin password, at least 12 characters. Set it yourself. |
| `ADMIN_SESSION_SECRET` | Random value, at least 32 characters, used to sign the session cookie. |
| `BLOB_READ_WRITE_TOKEN` | Access to the private Blob store `payout-calculator-rates`. Added automatically when the store was connected. |

To set or change the admin password, run this and type the password when asked, then
redeploy:

```bash
npx vercel env add ADMIN_PASSWORD production --sensitive
npx vercel deploy --prod
```

To change an existing password, remove it first with `npx vercel env rm ADMIN_PASSWORD
production`. Changing the password or the session secret signs every admin out.

### Sign-in protection

- The app locks a client out of sign-in for 15 minutes after 5 wrong passwords
  (tracked per server instance), and waits 1 second after every wrong password.
- A Vercel Firewall rule, **Admin sign-in rate limit**, allows at most 10 POST requests
  to `/admin` (sign-in, saving rates, sign-out) per IP address per 5 minutes. An address
  that goes over is blocked from those requests for 15 minutes. View or change it with
  `npx vercel firewall status` and `npx vercel firewall rules list`, or in the Vercel
  dashboard under Firewall.

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

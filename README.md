# Investment Payout Calculator

A public, no-login web calculator that shows the payout schedule for a fixed-term
investment. Visitors pick an investment amount, lock-in period, payout type, payout
frequency and annual interest rate, then get a payout-by-payout table with totals and a
CSV download.

This is an illustrative calculator prototype. It does not collect payments, register
investors or store any personal or financial information. All calculations run in the
visitor's browser.

## Tech stack

- Next.js (App Router) with TypeScript
- Tailwind CSS
- React state for inputs and results
- Vitest for calculation tests
- Vercel for hosting

## Project layout

| Path | Purpose |
| --- | --- |
| `src/lib/config.ts` | Defaults: interest rate, amounts, lock-in periods |
| `src/lib/payout.ts` | Calculation engine and rate validation |
| `src/lib/payout.test.ts` | Automated calculation tests |
| `src/lib/csv.ts` | CSV export |
| `src/lib/format.ts` | Currency, date and percent formatting |
| `src/components/PayoutCalculator.tsx` | Input form |
| `src/components/PayoutResults.tsx` | Summary, schedule table, CSV button, disclaimer |
| `src/app/page.tsx` | Page layout |

## Calculation rules

- Simple interest only. Interest is never compounded.
- Periods per year: Quarterly 4, Half-Yearly 2, Yearly 1.
- Total payout periods = lock-in years x periods per year.
- **Interest Only:** every payout is one period of interest on the original principal.
  The final payout adds the full principal. Total interest = principal x rate x years.
- **Interest and Principal:** principal is returned in equal installments. Each payout's
  interest = outstanding principal before that payout x rate / periods per year, so
  interest falls as principal is repaid.
- Money is calculated in whole cents with integer math, so results are exact and
  deterministic. Values are rounded half-up to the cent. The final payout absorbs any
  rounding difference, so totals always reconcile and the remaining principal ends at
  exactly $0.00.
- The rate must be between 0 and 100, with at most 4 decimal places.
- The schedule starts on the date the visitor submits the form. Each payout falls one
  period later. If that day does not exist in a month (for example the 31st), the last
  day of the month is used.

## Local development

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

### Checks

```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm test            # Vitest calculation tests
npm run build       # Production build
```

## Changing the default interest rate

1. Open `src/lib/config.ts`.
2. Change `DEFAULT_ANNUAL_RATE_PERCENT` (for example to `8.5`).
3. Run `npm test` and `npm run build` to confirm everything still passes.
4. Commit, push and redeploy (see below).

The same file holds the investment amount options and the default amount and lock-in period.

## Deploying updates

The site is hosted on Vercel.

**If the Vercel project is connected to the GitHub repository**, every push to the `main`
branch deploys to production automatically:

```bash
git add -A
git commit -m "Describe the change"
git push origin main
```

**To deploy from your machine with the Vercel CLI** instead:

```bash
npx vercel login          # first time only
npx vercel --prod
```

Run the checks above before deploying.

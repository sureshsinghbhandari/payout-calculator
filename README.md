# Investment Payout Calculator

A public, no-login web calculator that shows the payout schedule for a fixed-term
investment. Visitors pick an investment amount, lock-in period, payout type, payout
frequency and annual interest rate. They get a payout-by-payout table with totals,
comparisons with other scenarios, and an Excel download.

**Live site:** https://payout-calculator-steel.vercel.app

This is an illustrative calculator prototype. It does not collect payments, register
investors or store any personal or financial information. All calculations run in the
visitor's browser.

## Tech stack

- Next.js (App Router) with TypeScript
- Tailwind CSS
- React state for inputs and results
- ExcelJS for the Excel download, loaded only when the button is clicked
- Vitest for tests
- Vercel for hosting

## Project layout

| Path | Purpose |
| --- | --- |
| `src/lib/config.ts` | Defaults: standard rate per payout frequency, amounts, lock-in periods |
| `src/lib/payout.ts` | Calculation engine and rate validation |
| `src/lib/form.ts` | How the rate field follows the payout frequency |
| `src/lib/scenarios.ts` | Longer-payout-period and other-payout-type scenarios |
| `src/lib/excel.ts` | Excel workbook export |
| `src/lib/format.ts` | Currency, date and percent formatting |
| `src/lib/*.test.ts` | Automated tests |
| `src/components/PayoutCalculator.tsx` | Input form |
| `src/components/PayoutResults.tsx` | Summary, schedule table, Excel button, disclaimer |
| `src/components/ScenarioComparison.tsx` | Scenario comparisons on the results page |
| `src/app/page.tsx` | Page layout |

## Interest rates

Each payout frequency has a standard annual rate:

| Payout frequency | Standard rate |
| --- | --- |
| Quarterly | 8% |
| Half-Yearly | 9% |
| Yearly | 10% |

The rate field fills in the standard rate for the selected frequency and updates when
the frequency changes. Visitors can type any rate from 0% to 100%. Once they do, their
rate is kept when the frequency changes, and a link restores the standard rate.

## Scenario comparisons

After calculating, the results page and the Excel file compare the selection with:

- **Longer payout periods:** the same payout type, paid less often, each at its
  standard rate. Quarterly compares Half-Yearly and Yearly. Half-Yearly compares Yearly.
  Yearly has no longer period.
- **The other payout type:** Interest Only vs Interest and Principal at the same
  frequency and rate.

The Excel workbook contains these sheets:

1. `Your Selection`: the calculated schedule.
2. One `<Frequency> Payout` sheet per longer payout period.
3. One sheet for the other payout type.
4. `Comparison`: totals for every scenario side by side, plus a payout-by-payout
   comparison of the two payout types.

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

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

### Checks

```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm test            # Vitest tests
npm run build       # Production build
```

## Changing the default interest rates

1. Open `src/lib/config.ts`.
2. Change the numbers in `DEFAULT_RATE_BY_FREQUENCY`, for example `quarterly: 8.5`.
3. Update the expected rates in `src/lib/form.test.ts`, then run `npm test` and
   `npm run build`.
4. Commit, push and redeploy (see below).

The same file holds the investment amount options and the default amount, lock-in
period, payout frequency and payout type.

## Deploying updates

The site is hosted on Vercel as the `payout-calculator` project.

**From your machine with the Vercel CLI:**

```bash
npx vercel login          # first time only
npx vercel deploy --prod
```

**Automatic deploys from GitHub:** connect the repository once, either in the Vercel
dashboard (Project Settings, then Git) or with `npx vercel git connect`. After that,
every push to `main` deploys to production:

```bash
git add -A
git commit -m "Describe the change"
git push origin main
```

Run the checks above before deploying.

# Prompt: build the Trading dashboard page in another repo

Paste everything below the line into Claude Code (or any coding assistant) in the other repo.
It describes the page exactly as it is built in the Payout Calculator project (`/admin/trading`):
where the data comes from, what is shown, and the formats, sizes and colors used.

Things to change for the new repo are in angle brackets, for example `<ADMIN_ROUTE>`.
The data API contract is also in `docs/trading-dashboard-api.md` of this project; the summary
in section 2 is enough to build against.

---

## Task

Build a **read-only Trading dashboard** page at `<ADMIN_ROUTE, e.g. /admin/trading>` in this
Next.js (App Router) + React + TypeScript + Tailwind CSS 4 project. It shows end-of-day trading
results that a separate app ("the trading app", repo `tradiersuinew`) already computes and serves
over a small JSON API. The page never places orders and never writes anything to the trading app.
Only the signed-in owner/admin may open it (`<use this repo's existing admin auth guard>`).

First read this repo's own conventions (AGENTS.md / CLAUDE.md / README) and the Next.js docs in
`node_modules/next/dist/docs/` if present, then follow them. Match the existing code style.

## 1. Accounts

Two accounts (tabs of the trading app) are shown, in this order. Keep them in one file, for
example `src/lib/trading-accounts.ts`, so adding one is a one-line change:

| Label | Tab slug (used in the API) |
| --- | --- |
| Ashwin | `simulator` |
| Suresh_Live | `tradier-sb-live` |

Only the label is shown to people; the slug is what the API uses. The API also reports each tab's
`label`, `market` (`US`) and `currency` (`USD`); show amounts in that currency.

## 2. Where the data comes from

All data comes from the trading app's API, called **from the server only** (a server-only module,
never from the browser, so the token stays secret). Two environment variables, both required:

- `TRADING_API_URL`: the trading app's address, for example its ngrok tunnel
  `https://example.ngrok-free.app` (strip any trailing slash).
- `TRADING_API_TOKEN`: sent as `Authorization: Bearer <token>` on every request.

If either is missing, the page shows a card explaining the two settings instead of guessing.

Every request: `fetch(url, { headers: { Authorization }, cache: "no-store", signal: AbortSignal.timeout(8000) })`.
The API always answers JSON. Treat a non-JSON error page (ngrok "tunnel offline", gateway 502/504)
or a network failure or timeout as **the app is unreachable** (status `null`), not as a bad request.

Friendly error text:

- unreachable: "Could not reach the trading app. It may be turned off, asleep, or the tunnel may be down."
- 503: "The trading app's data API is not configured there yet (no token set)."
- 401: "The trading app rejected the token. Check TRADING_API_TOKEN matches its EOD_EXCEL_API_TOKEN."
- 429: "Too many requests to the trading app right now. Try again in a minute."
- 404: "That tab was not found, or has no strategies yet."
- otherwise the response's `error` string, or "The trading app returned an unexpected response (status N)."

### Endpoints (all GET, all under the base URL)

1. `/api/public/eod-excel/tabs` returns `{ version, tabs: [{ slug, label, market, currency }] }`.
2. `/api/public/eod-excel/tab/{slug}/data?sections=kpi,strategies` is the **Overview**:

```jsonc
{
  "version": 1,
  "tab": { "slug": "simulator", "label": "Ashwin", "market": "US", "currency": "USD" },
  "generatedAt": "2026-11-04T21:05:00Z",
  "asOf": "2026-11-04",
  "sections": ["kpi", "strategies"],
  "kpi": {
    "net": 333032, "lastDay": 1687, "monthNet": 0, "prevMonthNet": 218901,
    "tradeWinRate": 0.831, "dayWinRate": 0.889, "profitFactor": 4.07,
    "maxDd": -26625, "currentDd": 0, "roi": 0.583, "capital": 571000,
    "expectancy": 878.71, "avgWin": 1402, "avgLoss": -1723,
    "bestDay": 17864, "worstDay": -21027, "streak": 10,
    "charges": 1583, "gross": 334615, "sharpe": 15.18,
    "trades": 379, "tradingDays": 45
  },
  "strategies": [
    { "rank": 1, "name": "Michael", "underlying": "SPX", "capital": 60000, "netPnl": 41234,
      "roi": 0.687, "winRate": 0.85, "avgTrade": 900, "profitFactor": 4.2,
      "maxDrawdown": { "amount": -5200, "from": "2026-09-14", "to": "2026-09-21" },
      "streak": { "current": 3, "bestWin": 9, "bestLoss": 2 }, "lastTradeDate": "2026-10-30" }
  ]
}
```

   Fractions are plain fractions (0.831 = 83.1 %). Any number can be `null`. `rank` is the
   strategy's rank by all-time net P&L (highest first).

3. `/api/public/eod-excel/tab/{slug}/data?sections=month[&month=YYYY-MM]` is one **month sheet**
   (the current month when `month` is omitted; a bad month gives 400):

```jsonc
{
  "version": 1, "tab": { "...": "..." }, "generatedAt": "...", "sections": ["month"],
  "month": {
    "month": "2026-10",
    "available": ["2026-11", "2026-10", "2026-09"],      // months that have a sheet, newest first
    "columns": [ { "name": "EOM", "underlying": "SPX", "capital": 60000 } ],   // one per strategy, in sheet order
    "days": [ { "date": "2026-10-01", "values": [1250.5], "total": 1250.5, "cumulative": 1250.5 } ],
    "summary": {
      "returns": [..], "capital": [..], "roi": [..], "profitDays": [..], "lossDays": [..],   // one per column
      "total": { "returns": 0, "capital": 0, "roi": 0, "profitDays": 0, "lossDays": 0 }     // the TOTAL column
    }
  }
}
```

   `values[i]` belongs to `columns[i]`; it is 0 on a day the strategy closed nothing.
   `roi[i] = returns[i] / capital[i]` as a fraction, `null` without capital.

4. `/api/public/eod-excel/tab/{slug}/today` is **today's positions**:

```jsonc
{
  "version": 1, "tab": { "...": "..." }, "generatedAt": "...",
  "date": "2026-11-02", "marketOpen": true,
  "spot": [ { "symbol": "SPX", "price": 7619.5, "asOf": "2026-11-02T14:36:26Z" } ],
  "note": null,
  "rows": [ {
    "id": "spx30dte_179..._41096a97", "strategy": "Michael", "underlying": "SPX",
    "status": "open",            // "open" | "closed"
    "expiration": "2026-11-02", "dte": 0, "quantity": 1, "structure": "Iron condor",
    "legs": [ { "action": "sell", "type": "put", "strike": 7450, "quantity": 1,
                "expiration": null, "entryMid": 32.55, "mid": 0.23, "status": "open" } ],
    "entrySpot": 7738, "liveSpot": 7619.5,
    "openedAt": "2026-10-05T13:32:11Z", "closedAt": null, "exitReason": null,
    "distanceAtEntry": { "put": { "points": 288, "pct": 3.72, "steps": 58 }, "call": { "points": 187, "pct": 2.42, "steps": 37 } },
    "distanceNow":     { "put": { "points": 169.5, "pct": 2.22, "steps": 34, "breached": false }, "call": { "...": "..." } },
    "pnl": { "current": 2918.52, "unrealized": 2918.52, "realized": null, "entryCredit": 2935,
             "maxProfit": 2935, "maxRisk": 7065, "charges": 6.48, "markedAt": "2026-11-02T14:36:26Z" },
    "multiplier": 100
  } ]
}
```

   `pnl.current` is unrealized while open and realized once closed, net of charges. `pct` is already a
   percentage (3.72 means 3.72 %). `steps` is the ladder step from at-the-money (positive = OTM).
   Most fields can be `null`; render "—" for unknown values and never crash on them.

If the trading app does not serve month or today yet (400 "Unknown section", or 403/404/405 on
`/today`), show a card "The trading app does not serve <its month sheets | today's positions> yet."
instead of an error.

## 3. Page layout and chrome

- Page container: `mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10` (about 1280 px wide).
  Page background `bg-slate-50`, text `text-slate-900`. Header bar: white, `border-b border-slate-200`.
- Font: **Geist** (`next/font/google`, variable `--font-geist-sans`), fallback `ui-sans-serif, system-ui, sans-serif`,
  antialiased. Base text 16 px. Figures use `tabular-nums` everywhere so digits line up.
- Breadcrumb: `Admin / Trading dashboard`, `text-sm text-slate-500`.
- Title: `<h1 className="text-2xl font-semibold text-slate-900">Trading dashboard</h1>`, then a one-line
  description `mt-1 max-w-2xl text-sm text-slate-600`: "Read-only figures from a separate trading app on your
  own machine - the same numbers as its end-of-day Excel export and its Overview tab. Nothing here places an
  order or changes anything there."
- Two chip rows under it (`mt-5 space-y-3`), each a `<nav>` with a small uppercase label:
  **Account** (Ashwin | Suresh_Live) and **View** (Overview | Monthly sheet | Today). Label style:
  `text-xs font-semibold uppercase tracking-wide text-slate-500`. Chip: `rounded-full border px-3 py-1 text-xs font-semibold`;
  active `border-blue-900 bg-blue-900 text-white`, inactive `border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
  keyboard focus `focus-visible:ring-2 focus-visible:ring-blue-700`. Use real links with `aria-current="page"`.
- State lives in the URL so views can be bookmarked: `?tab=<slug>&view=<overview|month|today>&month=YYYY-MM`.
  Leave out whatever equals the default (first account, overview). The page is a server component that reads
  `searchParams` (a Promise in current Next.js), calls `connection()` so it is never prerendered, and wraps its
  content in `<Suspense>` with a "Loading..." fallback.
- Generic card: `rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8`.
  Error card: red text `text-sm font-medium text-red-700` with `role="alert"`.

## 4. Number and date formats

- Money: `Intl.NumberFormat("en-US", { style: "currency", currency, 0 decimals })`: `$12,340`, `-$627`.
  Signed money adds `+` for positive: `+$410`, `-$627`, zero stays `$0`.
- Percent: fraction x 100 with **1 decimal** (`83.1%`); the month sheet's ROI% uses **2 decimals**.
- Ratio (profit factor, Sharpe): 2 decimals. Whole numbers: thousands separators.
- Unknown (`null`, NaN): an em dash "-" (use the real character U+2014).
- Sheet dates: `Thu 01 Oct 2026` (`en-GB`, weekday short, day 2-digit, month short, year, timeZone UTC so no shifts).
- Month title: `October 2026`; short: `Oct 2026`.
- Times: always **US Eastern**. Clock `14:05` (24 h) for marks; full timestamp like `Nov 1, 2026, 7:48 PM EST`.
- P&L text colors: positive `text-emerald-700`, negative `text-red-700`, zero/unknown `text-slate-700`.
- Strikes and spots: integers without grouping (`7450`), otherwise 2 decimals without commas (`7619.5`).

## 5. View: Overview

First a small caption `text-xs text-slate-500`: `<Account label> · <currency> · Generated <timestamp>`.

### KPI tiles: two rows of 8 tinted tiles

Grid: `grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8`, rows 12 px apart. Tile:
`flex min-w-0 flex-col items-center justify-center rounded-xl border px-3 py-4 text-center shadow-sm`.
Label: `text-[11px] font-semibold uppercase tracking-wide text-slate-600`. Value:
`mt-1.5 break-words text-2xl font-bold tabular-nums`. Caption: `mt-1 text-xs italic text-slate-500`.

Tones (box / value color):

| Tone | Box | Value |
| --- | --- | --- |
| green | `border-emerald-200 bg-emerald-50` | `text-emerald-700` |
| red | `border-red-200 bg-red-50` | `text-red-700` |
| blue | `border-sky-200 bg-sky-50` | `text-sky-700` |
| amber | `border-amber-200 bg-amber-50` | `text-amber-800` |
| slate | `border-slate-200 bg-slate-50` | `text-slate-900` |

"Sign tone" means green above zero, red below, slate at zero or unknown.

Row 1 (label / value / caption / tone):

1. NET P&L (ALL TIME) / signed `net` / "{tradingDays} trading days" / sign tone
2. LAST TRADING DAY / signed `lastDay` / "most recent close" / sign tone
3. THIS MONTH / `monthNet` (unsigned) / "last month {prevMonthNet}" / sign tone, slate when 0
4. WIN RATE (TRADES) / `tradeWinRate` % / "{wins} wins / {losses} losses" (wins = round(trades x rate)) / green if >= 50 % else red
5. WIN RATE (DAYS) / `dayWinRate` % / "{green} green / {red} red" (green = round(tradingDays x rate)) / green if >= 50 % else red
6. PROFIT FACTOR / `profitFactor` / "avg win / avg loss {abs(avgWin / avgLoss) to 2 dp}" / green if >= 1 else red
7. MAX DRAWDOWN / `maxDd` / "now at equity peak" when `currentDd` is 0 or null, else "now {currentDd} below peak" / red
8. ROI ON CAPITAL / `roi` % / "on {capital} allocated" / sign tone

Row 2:

1. TRADES / `trades` / "closed trades" / blue
2. EXPECTANCY / TRADE / signed `expectancy` / "average net P&L per trade" / sign tone
3. AVG WIN / AVG LOSS / "{avgWin} / {avgLoss}" / "per trade" / slate
4. BEST DAY / signed `bestDay` / no caption / green
5. WORST DAY / signed `worstDay` / no caption / red
6. CURRENT STREAK / `+10 days` (sign shown, "day" when 1) / "winning days in a row" or "losing days in a row" / sign tone
7. CHARGES PAID / `charges` / "gross {gross}" / amber
8. SHARPE (DAILY, ANNUALIZED) / `sharpe` / "steadiness of the daily P&L" / slate

### Strategies table (below the tiles)

Heading `text-lg font-semibold text-slate-900`: "Strategies". Wrap the table in
`rounded-2xl border border-slate-200 bg-white shadow-sm` with an inner
`overflow-x-auto` region (`tabIndex={0}`, `role="region"`, an aria-label, focus ring), table
`w-full min-w-[920px] border-collapse text-sm`. Under 768 px show "Swipe the table sideways to see every column."
Header row: `bg-slate-100 text-xs uppercase tracking-wide text-slate-600`, cells `px-4 py-3 font-semibold`.
Body rows: zebra (`odd:bg-white even:bg-slate-50/60`), `border-b border-slate-100`, `tabular-nums text-slate-800`.

Columns: Rank | Strategy | Net P&L | ROI | Win rate | Profit factor | Max drawdown | Last trade.

- Rank: a 24 px grey circle badge (`bg-slate-100 text-xs font-bold text-slate-600`) with the number.
- Strategy: the name (`font-medium text-slate-900`) only. Do **not** show the underlying or structure text.
- Net P&L: signed money, bold, green/red by sign. ROI: percent. Win rate: percent with a thin bar
  (64 px wide, 6 px high, grey track, green fill at >= 50 %, else red) beside the number.
- Max drawdown: `maxDrawdown.amount`, red text. Last trade: the date string, or an em dash.
- **Row order = the Monthly sheet's column order** (not rank order): fetch the current month sheet too and sort the
  strategies by the position of their `name` in `month.columns`; any not found go last, by rank. The Rank column
  still shows P&L rank, so the numbers can look out of sequence. That is intended.

## 6. View: Monthly sheet (an Excel-style grid)

Above the grid: a row with a previous-month arrow, the centered title (`text-lg font-bold text-slate-900`, for example
"October 2026"), and a next-month arrow. Arrows are 36 px round white buttons (`size-9 rounded-full border border-slate-200
bg-white shadow-sm`) with a chevron icon; disabled (grey, `cursor-not-allowed`) when there is no older/newer month.
"Older" = the nearest key in `available` below the shown month, "newer" = nearest above. Below, on screens >= 640 px, a
centered list of pills for every month in `available` (current one solid `bg-slate-900 text-white`, others white with
border; `text-xs`, `rounded-full px-3 py-1`). Month links use `?view=month&month=YYYY-MM`.

Card: `rounded-2xl border border-slate-200 bg-white shadow-sm`. Top bar, navy `bg-[#1F3864] text-white`,
`px-4 py-2.5 text-sm font-bold`: "Performance Summary - {account label} ({Month Year})". The table sits in a region with
`max-h-[75vh] overflow-auto` (both directions) so the header rows and the first column stay put (`sticky`).
Table: `w-full min-w-max border-collapse text-sm text-slate-800`.

Header rows, in this order (first cell is a navy sticky-left label cell
`sticky left-0 z-10 whitespace-nowrap px-3 py-1.5 text-left font-semibold bg-[#1F3864] text-white`; value cells are
`bg-[#F1F5F9] px-3 py-1.5 text-center font-semibold tabular-nums`, red text when negative; a TOTAL cell, then one empty
`bg-[#F1F5F9]` cell for the CUMULATIVE column):

1. **Capital Required**: `summary.capital` per strategy, `summary.total.capital`.
2. **Returns**: `summary.returns`, `summary.total.returns`.
3. **ROI%**: `summary.roi` as a 2-decimal percent, `summary.total.roi`.
4. A one-line italic note across the full width (`text-xs italic text-slate-600`): "All figures in {currency}, net of broker
   charges; each day is the trades closed that day. Capital Required is the strategy's Funds allocated."
5. **Underlying**: each column's `underlying` in `bg-sky-100 font-semibold text-slate-900` cells.
6. **Profit Days**, 7. **Loss Days**: whole numbers per strategy and the total.
8. The sticky column-header row: **Date** (navy, uppercase, `text-xs font-bold`), one header per strategy
   (`px-3 py-2 text-center text-xs font-bold text-white`, name as is), **Total** (navy), **Cumulative** (`bg-teal-600`).
   Strategy header fills cycle by index through these Tailwind colors, all `-600` (lime is `-700`):
   blue, emerald, violet, amber, rose, cyan, indigo, lime-700, fuchsia, orange, teal, sky, purple, pink.

Body: one row per trading day, `border-b border-slate-100`. First cell: the date as `Thu 01 Oct 2026`, bold, sticky left,
white with a right border. Each strategy cell shows the money value centered with a **heat fill** based on
`abs(value) / (largest abs value of the sheet)`: zero -> `bg-white text-slate-400`; positive: > 66 % `bg-emerald-300 text-emerald-950`,
> 33 % `bg-emerald-200 text-emerald-900`, else `bg-emerald-100 text-emerald-900`; negative: the same with `red-300/200/100` and
`red-950/900/900`. TOTAL cell: white, bold, green/red by sign. CUMULATIVE cell: white, semibold, green/red by sign.
No days: "No closed trades in {Month Year} yet." Under 768 px show the sideways-swipe hint.

## 7. View: Today

Header line (`flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-700`): account label (bold) · the date in sheet format ·
each spot "SPX 7619.5 (as of 14:36)" · a pill "Market open" (emerald) / "Market closed" (slate) · on the right an auto-refresh
caption "Refreshes every 30 s · last 3:04:17 PM EDT" (`text-xs text-slate-500`). A small client component calls
`router.refresh()` every 30 s while the browser tab is visible and `marketOpen !== false`, and immediately when the tab becomes
visible again after more than 30 s. When paused it says "Auto-refresh paused".

No rows: a card "Nothing expiring or closing today for {account}." plus `note` if given.

Otherwise a table card like the others (`min-w-[560px]`, header `bg-slate-50 text-xs uppercase tracking-wide text-slate-600`, rows
`align-top border-b border-slate-100`). Columns:

1. **Strategy** (always shown): the strategy name in `font-medium text-slate-900`, then small pills (`rounded-full px-2 py-0.5 text-[11px]
   font-semibold ring-1 ring-inset`): "Open" (blue) or "Closed · {exitReason}" (slate), plus "Expires today" (amber) when open and `dte === 0`.
   **Do not show the underlying or structure text** ("SPX", "Iron condor") anywhere on this page, including the payoff dialog title.
2. **Today's position** (hidden by default, see settings): the legs sorted by strike descending, one line each, monospace
   `font-mono text-xs tabular-nums`: `S 7450 P x1 @ 32.55` (S = sell in red-700 bold, B = buy in emerald-700 bold; strike right-aligned
   in a 64 px box; P/C; quantity; entry mid in slate-400). Closed legs are struck through in slate-400. Under the legs:
   `{n} lot(s) · exp {expiration}` in `text-[11px] text-slate-500`.
3. **Distance now** (hidden by default) and 4. **Distance at entry** (hidden by default): two lines `P 169.5 (2.22%) OTM+34` and `C ...`
   (P in red-700, C in emerald-700, `text-xs`), an amber "ITM" badge when `breached`, then `spot 7619.5` (`text-[11px] text-slate-500`).
   Distance now uses `liveSpot`; at entry uses `entrySpot`. A missing side shows an em dash. Step label: 0 -> "ATM", n > 0 -> "OTM+n", n < 0 -> "ITM-n" (for example "ITM-2").
5. **Current P/L** (always shown, right aligned): a tiny caption "UNREALIZED" or "REALIZED" (`text-[10px] font-semibold uppercase`), the
   amount (`text-lg font-semibold`, green/red by sign), then `of max {maxProfit} · {share}%` (`text-[11px] text-slate-500`; share =
   round(current / maxProfit x 100) only when both are positive) and `· at {HH:MM}` from `pnl.markedAt`. "max unknown" when `maxProfit` is null.
6. **Payoff** (always shown, centered): a small icon button (a line-chart glyph, 32 px, `text-slate-500 hover:bg-slate-100`) that opens a modal
   `<dialog>` (see below) - only when every open leg has a strike and an entry mid; otherwise an em dash.

Footer row (`bg-slate-50`): "Total" with beneath it "{n} positions · {x} open · {y} closed" (`text-xs text-slate-600`), and the sum of
`pnl.current` right-aligned (`text-lg font-semibold`, green/red).

### Settings gear (hide/show columns)

A round 32 px **gear icon button** (no text label; `aria-label` and `title` "Table settings") sits above the table on the right. It opens
a small popover (`<details>`, panel `w-52 rounded-xl border border-slate-200 bg-white p-3 shadow-lg`) with three checkboxes: **Today's position**,
**Distance now**, **Distance at entry**. All three are **unchecked by default**. The choice is saved in `localStorage`
(key `trading-today-columns`) and applies on later visits; fall back to an in-memory value if storage is blocked. The table can stay a server
component: the wrapper puts `data-hide="position now entry"` (the hidden ones) on a parent element, and the cells carry Tailwind arbitrary-variant
classes such as `[[data-hide~=position]_&]:hidden`. Use `useSyncExternalStore` for the stored choice so the server render and first client render
match (all hidden) and the saved choice applies right after.

### Payoff dialog

Native `<dialog>` opened with `showModal()`, `w-[min(92vw,760px)] rounded-2xl border border-slate-200 bg-white shadow-xl`, backdrop
`backdrop:bg-slate-900/40`, closes on the X button, Escape and a backdrop click. Title "Payoff at expiration" (`text-base font-semibold`), the
position's strategy name under it (`text-sm text-slate-600`). Body: an inline **SVG chart (no chart library)**, then a 4-column summary
(`text-sm`, labels `text-xs font-semibold uppercase tracking-wide text-slate-500`): **Max profit** (emerald-700), **Max loss** (red-700),
**Breakevens** ("6890 / 7860"), **Credit** or **Debit**. Footnote `text-xs text-slate-500`: "Open legs only, at entry mids, before charges. Spot X · entry spot Y".

Payoff math (open legs only): for each leg, per unit at settlement price `p`: intrinsic = max(0, p - strike) for calls, max(0, strike - p) for puts;
sell leg P/L = entryMid - intrinsic, buy leg P/L = intrinsic - entryMid; position P/L = sum of (per unit x leg quantity x multiplier).
Sample 200 evenly spaced prices plus every strike over a range from (lowest strike - 1.5 x widest wing width) to (highest strike + 1.5 x widest wing
width), widened to cover spot and entry spot +/- 2 %. Find max profit, max loss, and breakevens by linear interpolation where the sign flips.
Prefer the API's `maxProfit`, `maxRisk` (shown as negative) and `entryCredit` in the summary when given.

Chart (viewBox 640 x 320, padding top 28 / right 20 / bottom 40 / left 64): light grid lines (slate-100), axis lines (slate-300), tick labels
11 px (money on Y, price on X, "nice" 1/2/5 steps), the P/L line 2 px in emerald-600 above zero and red-600 below (clip paths at the zero line) with
the area filled at 18 % opacity in emerald-500 / red-500, a zero line (slate-500), dashed vertical lines at each strike with 10 px labels above,
a dotted line for the entry spot (labelled "entry N"), a solid blue-700 line for the live spot (labelled "spot N", semibold), white circles with a slate-700
ring at the breakevens ("BE N"), and "max +$X" / "min -$X" labels in emerald-700 / red-700, semibold 11 px.

## 8. Saved copies and refresh schedule (keeps the page working when the trading app is off)

The trading app runs on the owner's own PC behind a tunnel, so it is often off. Keep copies in **Vercel Blob** (private access) and fall
back to them. (If the new repo does not use Vercel, use any key-value or file store; the logic is what matters.)

- One JSON file per account and view: `trading/<env>/<slug>/overview.json`, `month-YYYY-MM.json`, `today.json`, each `{ "savedAt": ISO, "data": <API response> }`.
  `<env>` is `production` only on the production deployment, otherwise the environment name or `local`. Overwrite on save; saving is best effort
  and must never break the page (log and move on). Env var: `BLOB_READ_WRITE_TOKEN`.
- **Overview**: live first; on success save it; if the app is unreachable show the saved copy.
- **Month sheets**: served from the saved copy until the next scheduled refresh time has passed; refresh times are **9:35 AM and 4:01 PM US Eastern
  on weekdays**. If the copy was saved before the most recent refresh time, call the app live, save the result, and show it. If the app is
  unreachable, show the older copy. A past month whose copy was saved after that month ended is final and is served without calling the app.
  A month list from an old copy may miss newer months, so merge in the months the current month's copy knows about.
- **Today**: always live. If unreachable, show a saved copy **only if it was saved today (Eastern)**; yesterday's open positions would mislead.
- Fall back **only on an outage** (no answer). A refusal (bad token, missing tab, bad request) must be shown as that error, never hidden by old data.
- With no saved copy and the app down, show the outage message plus "No saved copy exists yet." and how to create one.
- When showing a copy because the app is down, show above the view an amber notice (`rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900`,
  `role="status"`): "The trading app is unreachable. Showing the copy saved {timestamp}; it updates at 9:35 AM and 4:01 PM Eastern and whenever the app can be
  reached." For a final closed month: "Closed month, shown from the copy saved {timestamp}."
- On the Monthly sheet, a quiet centered caption above the grid: "Updated {timestamp} · refreshed twice a day, at 9:35 AM and 4:01 PM Eastern."
- A **cron route** (`/api/cron/trading-snapshots`, protected with `Authorization: Bearer $CRON_SECRET`; refuse everything when `CRON_SECRET` is unset)
  refreshes, for each account, the Overview and the current and previous month sheet. Vercel cron is UTC and ignores daylight saving, so schedule
  both candidates of each time on weekdays in `vercel.json` (`35 13 * * 1-5`, `35 14 * * 1-5`, `1 20 * * 1-5`, `1 21 * * 1-5`) and have the route do
  the work only when the current Eastern hour is 9 or 16. On Vercel's free plan a job runs somewhere inside its hour, which the page-view refresh above covers.
- Optional one-time sync script (`npm run trading:sync`) that reads the trading app on `http://localhost:3000` (token from that repo's `.env`) and saves
  every month and today into the store, to fill the copies from the start.

## 9. Accessibility and behavior details

- Real `<table>` markup with `<caption class="sr-only">`, `scope` on header cells, `th scope="row"` for row labels.
- Scrollable table regions are focusable (`tabIndex={0}`, `role="region"`, aria-label, visible focus ring `focus-visible:ring-2 focus-visible:ring-blue-700`).
- Icon-only buttons have `aria-label` and `title`. Charts have `role="img"` with an aria-label that states max profit, max loss and breakevens.
- Mobile: tables scroll sideways; text inputs on phones stay 16 px; tap targets are at least 32 px.
- Never print the token or the API address into the page or into logs.
- No test or browser verification is required for this prompt, but type-check and lint must pass.

## 10. Files to create (suggested)

- `src/lib/trading-accounts.ts`: the account list.
- `src/lib/server/trading-api.ts`: server-only client (types, `call()`, `getTradingTabData`, `getTradingMonth`, `getTradingToday`, error mapping).
- `src/lib/server/trading-snapshots.ts`: saved copies, refresh times, `loadOverview`, `loadMonth`, `loadToday`, `refreshSnapshots`.
- `src/app/<ADMIN_ROUTE>/page.tsx`: the page (account/view chips, sections, notices).
- `src/components/trading/{format.ts, OverviewView.tsx, MonthSheet.tsx, TodayView.tsx, TodayColumns.tsx, AutoRefresh.tsx, PayoffDialog.tsx, payoff-legs.ts}`.
  Keep `canDrawPayoff` in `payoff-legs.ts` (a plain module): a server component cannot call a function exported from a `"use client"` file.
- `src/app/api/cron/trading-snapshots/route.ts` and the entries in `vercel.json`.
- `.env.example` entries: `TRADING_API_URL`, `TRADING_API_TOKEN`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`.

When done, list what you built, anything you could not verify, and the environment variables I must set.

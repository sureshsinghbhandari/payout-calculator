# Trading dashboard API (contract with tradiersuinew)

The admin **Trading dashboard** of this app reads, over the owner's ngrok tunnel and with a bearer token, the read-only **EOD Excel data API** of the trading app at `C:\MyGithub\tradiersuinew` (an Express ESM server in `server/src`). Today that API serves two routes: `GET /api/public/eod-excel/tabs` (the tabs that have data) and `GET /api/public/eod-excel/tab/:slug/data?sections=kpi,strategies` (the Dashboard tiles and the ranked strategies, the same numbers the app writes into its `<Tab> - EOD DATA.xlsx` workbook). The client on this side is `src/lib/server/trading-api.ts`; the JSON field names and their meanings in that file are the source of truth for everything below.

This document is the contract between the two repositories for two additions the dashboard needs: a **`month` section** on the existing data route (one month sheet of the workbook as JSON, so the page can step through months) and a **`today` route** (every position of a tab that expires, closes or closed today, with its live P&L and the distance of its short strikes from the spot). The Payout Calculator side is already written against this contract and copes while the other app has not been updated (it shows the other app's error message). Section 3 holds the complete prompt to paste into Claude Code in `tradiersuinew` to build the other side; section 4 says what to do once it is built.

## 1. What exists today (verified in tradiersuinew)

| Piece | File | Notes |
|---|---|---|
| Route | `server/src/routes/eodExcelDataRouter.js` | `createEodExcelDataRouter({ analyze = analyzeTab, tabs = listDataTabs, env = () => process.env, now = Date.now, ttlMs = CACHE_TTL_MS, log = console.warn })`; `CACHE_TTL_MS = 30_000`, `MIN_TOKEN_LENGTH = 20`, `FAILURES_PER_MINUTE = 30`. CORS middleware, then token + failure limiter, then `GET /tabs`, `GET /tab/:slug/data`, then a catch-all `405 GET only`. The cache is a `Map` slug -> `{ at, promise }` of `analyze(slug, { now })`. |
| Mount | `server/src/routes/healthSummaryRouter.js` | `router.use('/public/eod-excel', eodExcelDataRouter)` (so the full path is `/api/public/eod-excel/...`). |
| Sections | `server/src/eodExcel/dataApi.js` | `API_VERSION = 1`; `SECTIONS = Object.freeze({ kpi: A => kpiObject(A.kpi), strategies: A => ... })`, each a function `(analytics) -> JSON`; `SECTION_NAMES`, `parseSections(value)` (400 message `Unknown section: x. Supported: kpi, strategies`), `buildTabData(A, { tab, currency, sections, now })` builds the envelope `{ version, tab, generatedAt, asOf, sections, ...sections }`. |
| Analytics | `server/src/eodExcel/service.js` | `analyzeTab(slug, { registry, readFunds, now })` -> `{ tab, currency, A }` or `null` (unknown / disabled / archived / no strategies); `collectTab(tab, { funds, now })`; `listDataTabs({ registry })`; `eligibleTabs(reg)`; `etFormat` / `istFormat` (`en-CA` date formatters for New York / Kolkata). `analyze()` itself is `server/src/eodExcel/analytics.js`: `A.days` = `[{ date, net, trades, per: Map<strategyIndex, net> }]` ascending by date, `A.strategies` = `[{ name, underlying, capital, trades, byDate, idx }]`, `A.stats`, `A.kpi`. |
| Month sheets | `server/src/eodExcel/buildWorkbook.js` | `monthsToShow(strategies, todayMonth)` (exported: every month with a closed trade plus the current one, newest first) and the module-private `addMonthSheet(wb, { tabLabel, currency, A, month })`: `days = A.days.filter(d => d.date.startsWith(month))`, `colSum[i] = round2(sum of d.per.get(i) ?? 0)`, capital shown only when `Number(capital) > 0`, ROI result `colSum[i] / capital` (unrounded fraction, `''` without capital), profit / loss days = count of `> 0` / `< 0` per column, TOTAL column = sums across strategies, its ROI `total / capSum` (`capSum` = sum of the positive capitals), its day counts over `d.net`; each data row writes `d.per.get(i) ?? 0`, `d.net` and `cum = round2(cum + d.net)`. |
| Tunnel guard | `server/src/lib/tunnelGuard.js` | Line 16: `const PUBLIC_EOD_DATA = /^\/api\/public\/eod-excel\/(?:tabs|tab\/[a-z0-9][a-z0-9-]{0,79}\/data)\/?$/i;` used by `isPublicReadRoute(req)` for `GET` and `OPTIONS` only. Mounted first in `server/src/app.js` (`app.use(createTunnelGuard(...))`). |
| Swagger | `server/src/docs/paths/misc.js` | Tag `EOD Excel` (line ~38), shared pieces `EOD_SLUG`, `EOD_PUBLIC_ERRORS` (~494-510), the two public paths at `'/api/public/eod-excel/tabs'` and `'/api/public/eod-excel/tab/{slug}/data'` (~863-887), built with the file's `op / json / fail / obj / arr / str / nstr / nnum / num / bool / anyObject` helpers. |
| Docs | `docs/eod-excel.md` | Section "Data API (JSON, 2026-10-31)". |
| Tests | `tests/server/eodExcel.test.js` (from line ~528: `fakeTabs`, `fakeRegistry`, `dataApp({ env, analyze, ttlMs, clock, log })`, `withServer(router, fn)` at ~282, `adapter(slug, history, extra)` at ~110), `tests/server/tunnelGuard.test.js` (the pass / refuse lists at ~219-245) | Run with `npm run test:server` (`node --import ./tests/server/testSetup.js --test "tests/server/*.test.js"`). |

Tabs of interest: `simulator` and `tradier-sb-live` (both listed in `config/settings.json` `tabOrder.US` as `/tab/simulator`, `/tab/tradier-sb-live`; the tab records themselves come from the flavor registry, `server/src/services/condorFlavors.js` `getTabs()`, through `getAdapterRegistry().listTabs()`).

## 2. Contract

Both additions keep `version: 1`, keep every existing field unchanged, and follow the existing rules: amounts in the tab's currency (`tab.currency`, USD or INR) net of broker charges, numbers rounded to 2 decimals where the workbook rounds, `null` (never `NaN`, `Infinity` or `undefined`) for a figure that does not exist. Same token, failure limiter, CORS and `Cache-Control: no-store` as the existing routes.

### 2.1 Addition 1: the `month` section

`GET /api/public/eod-excel/tab/:slug/data?sections=month[&month=YYYY-MM]`

Under the key `month` the response carries one month sheet of the workbook. `sections=kpi,strategies,month` works in one call (the envelope's `sections` array then lists all three). Without `month=` the current month in the tab's market time zone is returned (America/New_York for US tabs, Asia/Kolkata for India tabs).

```json
{
  "version": 1,
  "tab": { "slug": "tradier-sb-live", "label": "Tradier_SB Live", "market": "US", "currency": "USD" },
  "generatedAt": "2026-10-30T20:05:00.000Z",
  "asOf": "2026-10-30",
  "sections": ["month"],
  "month": {
    "month": "2026-10",
    "available": ["2026-10", "2026-09", "2026-08"],
    "columns": [
      { "name": "SB 0DTE P2", "underlying": "SPX", "capital": 50000 },
      { "name": "SB Weekly P11", "underlying": "SPX", "capital": 100000 }
    ],
    "days": [
      { "date": "2026-10-28", "values": [120.5, 0], "total": 120.5, "cumulative": 120.5 },
      { "date": "2026-10-29", "values": [-310, 84.2], "total": -225.8, "cumulative": -105.3 },
      { "date": "2026-10-30", "values": [58.8, 0], "total": 58.8, "cumulative": -46.5 }
    ],
    "summary": {
      "returns": [-130.7, 84.2],
      "capital": [50000, 100000],
      "roi": [-0.002614, 0.000842],
      "profitDays": [2, 1],
      "lossDays": [1, 0],
      "total": { "returns": -46.5, "capital": 150000, "roi": -0.00031, "profitDays": 2, "lossDays": 1 }
    }
  }
}
```

`TradingMonth`:

| Field | Type | Meaning |
|---|---|---|
| `month` | `string` | `YYYY-MM` of the sheet returned. |
| `available` | `string[]` | Every month that has a sheet (a closed trade), newest first; the current month (market time zone) is always included even without trades. Exactly `monthsToShow(A.strategies, currentMonth)`. |
| `columns` | `TradingMonthColumn[]` | The strategy columns, in the workbook's order (`A.strategies`): the tab's strategies that have at least one closed trade, the same on every month. |
| `columns[].name` | `string` | The strategy's display name (the column header). |
| `columns[].underlying` | `string \| null` | The strategy's underlying (`adapter.instrument.symbol`), `null` when empty. |
| `columns[].capital` | `number \| null` | The strategy's funds allocated ("Capital Reqd": `settings.strategyFunds.<strategyId>.accountBalance`, else the flavor's `accountBalance`); `null` when none is set or not `> 0`. |
| `days` | `TradingMonthDay[]` | One entry per trading day of the month that had at least one closed trade in the tab, ascending by date (`A.days.filter(d => d.date.startsWith(month))`). |
| `days[].date` | `string` | `YYYY-MM-DD`, the market day the trades closed. |
| `days[].values` | `number[]` | One net figure per column in `columns` order; `0` for a strategy with no closed trade that day. |
| `days[].total` | `number` | The day's total across the columns (`d.net`). |
| `days[].cumulative` | `number` | Running total of `total` from the first day of the month, `round2` at each step. |
| `summary.returns` | `number[]` | Per column: `round2(sum of the column's values)`. |
| `summary.capital` | `(number \| null)[]` | Per column: the same number as `columns[].capital`. |
| `summary.roi` | `(number \| null)[]` | Per column: `returns / capital` as a plain fraction (0.0123 = 1.23 %), not rounded to 2 decimals; `null` without capital. |
| `summary.profitDays` | `number[]` | Per column: days with a value `> 0`. |
| `summary.lossDays` | `number[]` | Per column: days with a value `< 0` (a `0` counts for neither). |
| `summary.total.returns` | `number` | `round2(sum of summary.returns)`. |
| `summary.total.capital` | `number \| null` | Sum of the positive capitals; `null` when no column has one. |
| `summary.total.roi` | `number \| null` | `total.returns / total.capital`, `null` without capital. |
| `summary.total.profitDays` / `lossDays` | `number` | Days whose `total` is `> 0` / `< 0`. |

Behaviour:

- A `month=` that is not `YYYY-MM` with a month 01-12 -> `400 { error }` (the same status the route already gives an unknown section).
- A valid month that is not in `available` -> `200` with that `month`, the full `columns`, `days: []` and a zeroed summary (`returns` all 0, `capital` as usual, `roi` all `null`, day counts 0, `total: { returns: 0, capital, roi: null, profitDays: 0, lossDays: 0 }`), so the page can step past an empty month.
- `404 { error: "no main tab '<slug>' with strategies" }`, `401`, `429`, `503`, `405` exactly as today. `400` for an unknown section, naming the supported ones (the dashboard passes that message through to the page while the other app is not updated).
- The 30 s per-tab cache stays: the month filter is applied to the cached analytics, so stepping through months never triggers another `analyze()`.

### 2.2 Addition 2: the `today` route

`GET /api/public/eod-excel/tab/:slug/today`

Every position of the tab's strategies that (a) is open and expires today, or (b) is open and is scheduled to close today by the engine's own rules (`closeAfterTradingDays` / `closeTimeEST`, the expiry-day cut at `expiryCloseTimeEST`), or (c) closed or expired today (ledger row with `closedDateEst` = today). One row per position: a strategy with two positions gives two rows. Short-lived (its own cache of about 10 s) so the dashboard may poll it.

```json
{
  "version": 1,
  "tab": { "slug": "tradier-sb-live", "label": "Tradier_SB Live", "market": "US", "currency": "USD" },
  "generatedAt": "2026-10-30T15:42:10.000Z",
  "date": "2026-10-30",
  "marketOpen": true,
  "spot": [{ "symbol": "SPX", "price": 6780.15, "asOf": "2026-10-30T15:42:08.000Z" }],
  "rows": [
    {
      "id": "spx-20261030-093205-a1b2",
      "strategy": "SB 0DTE P2",
      "underlying": "SPX",
      "status": "open",
      "expiration": "2026-10-30",
      "dte": 0,
      "quantity": 2,
      "structure": "Iron condor",
      "legs": [
        { "action": "buy",  "type": "put",  "strike": 6675, "quantity": 2, "expiration": null, "entryMid": 0.45, "mid": 0.20, "status": "open" },
        { "action": "sell", "type": "put",  "strike": 6700, "quantity": 2, "expiration": null, "entryMid": 1.05, "mid": 0.55, "status": "open" },
        { "action": "sell", "type": "call", "strike": 6850, "quantity": 2, "expiration": null, "entryMid": 1.10, "mid": 0.95, "status": "open" },
        { "action": "buy",  "type": "call", "strike": 6875, "quantity": 2, "expiration": null, "entryMid": 0.50, "mid": 0.45, "status": "open" }
      ],
      "entrySpot": 6772.4,
      "liveSpot": 6780.15,
      "openedAt": "2026-10-30T13:32:05.000Z",
      "closedAt": null,
      "exitReason": null,
      "distanceAtEntry": {
        "put":  { "points": 72.4, "pct": 1.07, "steps": 14 },
        "call": { "points": 77.6, "pct": 1.15, "steps": 16 }
      },
      "distanceNow": {
        "put":  { "points": 80.15, "pct": 1.18, "steps": 16, "breached": false },
        "call": { "points": 69.85, "pct": 1.03, "steps": 14, "breached": false }
      },
      "pnl": {
        "current": 58.8,
        "unrealized": 58.8,
        "realized": null,
        "entryCredit": 240,
        "maxProfit": 240,
        "maxRisk": 4760,
        "charges": 11.2,
        "markedAt": "2026-10-30T15:42:08.000Z"
      },
      "multiplier": 100
    },
    {
      "id": "spx-20261029-093204-c3d4",
      "strategy": "SB Weekly P11",
      "underlying": "SPX",
      "status": "closed",
      "expiration": "2026-10-30",
      "dte": 0,
      "quantity": 1,
      "structure": "Iron condor",
      "legs": [
        { "action": "buy",  "type": "put",  "strike": 6650, "quantity": 1, "expiration": null, "entryMid": 0.60, "mid": 0.05, "status": "closed" },
        { "action": "sell", "type": "put",  "strike": 6675, "quantity": 1, "expiration": null, "entryMid": 1.35, "mid": 0.15, "status": "closed" },
        { "action": "sell", "type": "call", "strike": 6875, "quantity": 1, "expiration": null, "entryMid": 1.25, "mid": 0.30, "status": "closed" },
        { "action": "buy",  "type": "call", "strike": 6900, "quantity": 1, "expiration": null, "entryMid": 0.55, "mid": 0.10, "status": "closed" }
      ],
      "entrySpot": 6755.9,
      "liveSpot": 6778.6,
      "openedAt": "2026-10-29T13:32:04.000Z",
      "closedAt": "2026-10-30T14:58:31.000Z",
      "exitReason": "profit-target",
      "distanceAtEntry": {
        "put":  { "points": 80.9, "pct": 1.2, "steps": 16 },
        "call": { "points": 119.1, "pct": 1.76, "steps": 24 }
      },
      "distanceNow": {
        "put":  { "points": 103.6, "pct": 1.53, "steps": 21, "breached": false },
        "call": { "points": 96.4, "pct": 1.42, "steps": 19, "breached": false }
      },
      "pnl": {
        "current": 108.4,
        "unrealized": null,
        "realized": 108.4,
        "entryCredit": 145,
        "maxProfit": 145,
        "maxRisk": 2355,
        "charges": 6.6,
        "markedAt": "2026-10-30T14:58:31.000Z"
      },
      "multiplier": 100
    }
  ],
  "note": null
}
```

(Numbers in the example are consistent with the engine's formulas: the open row's entry mids net to a 1.20 credit, the live mids to a 0.85 cost to close, so `unrealized = (1.20 - 0.85) x 100 x 2 - 11.2 = 58.8`; `entryCredit = 1.20 x 100 x 2 = 240`; `maxRisk = (25 - 1.20) x 100 x 2 = 4760`; distances are `|spot - short strike|` and that over the spot in percent, steps on the 5-point SPX ladder.)

`TradingToday`:

| Field | Type | Meaning |
|---|---|---|
| `version` | `number` | `1`. |
| `tab` | `TradingTab` | `{ slug, label, market, currency }`, the same object the data route sends. |
| `generatedAt` | `string` | ISO time the response was computed (the cache's time). |
| `date` | `string` | The market day (`YYYY-MM-DD`, market time zone) the rows are for. |
| `marketOpen` | `boolean \| null` | Whether the market is open right now (the app's own market-hours helper), so the page knows if the "now" figures move; `null` when unknown. |
| `spot` | `{ symbol, price, asOf }[]` | The live underlying price(s) the rows use (`SPX`, ...), `price` `null` with the time of the mark when unavailable. |
| `rows` | `TradingTodayRow[]` | See below. Empty array when nothing qualifies. |
| `note` | `string \| null` | A sentence when some of the tab's strategies cannot list positions (an engine family without `readOpenPositions` or without a live mark), else `null`. |

`TradingTodayRow`:

| Field | Type | Meaning |
|---|---|---|
| `id` | `string` | A stable key: the position's `id` in the other app (the same id on the open position and on its ledger row). |
| `strategy` | `string` | The strategy's display name (`adapter.displayName`). |
| `underlying` | `string \| null` | The instrument (`SPXW` reported as `SPX`, as `positionUnderlying` does). |
| `status` | `"open" \| "closed"` | `open` = still running, `closed` = closed or expired today. |
| `expiration` | `string` | `YYYY-MM-DD`. |
| `dte` | `number \| null` | Calendar days from `date` to `expiration` (0 = expires today). |
| `quantity` | `number` | Lots (condors / spreads), not contracts. |
| `structure` | `string \| null` | A short description: `"Iron condor"`, `"Put credit spread"`, `"Call credit spread"`, `"Iron butterfly"`, ... |
| `legs` | `TradingLeg[]` | ALL legs, in the engine's order. |
| `legs[].action` | `"buy" \| "sell"` | |
| `legs[].type` | `"put" \| "call"` | |
| `legs[].strike` | `number` | |
| `legs[].quantity` | `number` | Contracts of this leg: the leg's own ratio (1 when the engine records none) x the position's lots. |
| `legs[].expiration` | `string \| null` | `YYYY-MM-DD`; `null` when it is the position's own expiration (only a calendar / diagonal leg differs). |
| `legs[].entryMid` | `number \| null` | The leg's booked entry price per share / index point (`leg.entryMid`), `null` when not recorded. |
| `legs[].mid` | `number \| null` | The leg's live mid now (`round2((bid + ask) / 2)`), or its exit price (`exitMid`) on a closed row; `null` without a usable quote. |
| `legs[].status` | `"open" \| "closed"` | `closed` for a leg already bought back (and for every leg of a closed row). |
| `entrySpot` | `number \| null` | The underlying when the position was opened (`position.entrySpot`, else `entry.spot`). |
| `liveSpot` | `number \| null` | The underlying now (the same spot as in `spot[]`); on a closed row the `exitSpot` the ledger recorded. |
| `openedAt` / `closedAt` | `string \| null` | ISO timestamps; `closedAt` `null` while open. |
| `exitReason` | `string \| null` | The ledger's `reason` as written by the engine (`profit-target`, `stop-loss`, `expiry-close`, `scheduled-close`, `expired-settled`, ...); `null` while open. |
| `distanceAtEntry` | `TradingDistance \| null` | The stored `entry.distance` of the position (`{ put?, call? }`), `null` when the engine never recorded one and no entry spot exists. |
| `distanceNow` | `TradingDistance \| null` | The same figures against the live spot (`liveFields` / `computeDistance`); on a closed row the recorded `exit.distance`. |
| `distance.put` / `.call` | `TradingDistanceSide \| null` | Only the sides the structure has. |
| `...side.points` | `number` | `|spot - short strike|`, 2 decimals, always positive. |
| `...side.pct` | `number` | `points / spot x 100`, 2 decimals. |
| `...side.steps` | `number \| null` | Ladder steps from the at-the-money strike: positive = OTM ("OTM+14"), negative = ITM ("ITM-2"); `null` when unknown. Entry: `entryMoneynessSteps`; now: `moneynessSteps`. |
| `...side.breached` | `boolean` (optional) | Only on `distanceNow`: `true` when the spot has crossed that short strike (`computeDistance`'s `itm` flag: put strike above the spot, call strike below it). |
| `pnl.current` | `number \| null` | The figure to show: `unrealized` while open, `realized` once closed. Net of charges, in the tab's currency. |
| `pnl.unrealized` | `number \| null` | Open rows: the engine's `unrealizedPnL` = `round2((entryCredit - costToClose) x multiplier x quantity - charges)`; `null` when any leg has no usable quote. `null` on closed rows. |
| `pnl.realized` | `number \| null` | Closed rows: the ledger's `realizedPnL` (net of charges). `null` on open rows. |
| `pnl.entryCredit` | `number \| null` | The credit received at entry in currency for all lots (`entryNetDollars`, i.e. `entryCredit x multiplier x quantity`). |
| `pnl.maxProfit` | `number \| null` | The position's maximum profit in currency (a credit condor: the credit itself), `null` when unknown. |
| `pnl.maxRisk` | `number \| null` | The position's maximum loss in currency (`position.maxRisk`), `null` when unknown. |
| `pnl.charges` | `number \| null` | The brokerage the P&L is net of (open: `openCondorCharges(position).total`, the entry paid plus the estimated close; closed: the ledger's `charges`). |
| `pnl.markedAt` | `string \| null` | ISO time of the mark `current` was computed from (the quote batch time on an open row; `closedAt` on a closed row). |
| `multiplier` | `number` | Contract multiplier for the payoff (`100` for US index / equity options; the lot size for India). |

Behaviour: `404` for a tab without strategies (the same `analyzeTab`-style rule: unknown, disabled, archived or no adapters), `401` / `429` / `503` / `405` as the data route, `500 { error }` when the engines cannot be read. Must not run the full `analyze()`; a cached answer is served for about 10 s per tab.

### 2.3 How the dashboard calls it

`src/lib/server/trading-api.ts`: `getTradingMonth(slug, month?)` -> `.../data?sections=month[&month=YYYY-MM]`, `getTradingToday(slug)` -> `.../today`, both with `Authorization: Bearer <TRADING_API_TOKEN>` against `TRADING_API_URL`, an 8 s timeout and `cache: "no-store"`. Non-2xx answers become a friendly message (`friendlyError`): 503 "not configured there yet", 401 "rejected the token", 429 "too many requests", 404 "tab not found", otherwise the body's `error` string.

## 3. Prompt for Claude Code in tradiersuinew

Paste everything inside the fence below into Claude Code opened at `C:\MyGithub\tradiersuinew`.

~~~~text
Add two read-only additions to the EOD Excel data API (docs/eod-excel.md, "Data API") so an external dashboard can show one month sheet of the workbook as JSON and today's positions with their live P&L. The dashboard on the other side is already written against the exact contract below; its field names and meanings are fixed, so build to them rather than to taste. Read the files named here before writing code.

## Goal

1. A `month` section on the existing route: `GET /api/public/eod-excel/tab/:slug/data?sections=month[&month=YYYY-MM]` returns, under the key `month`, the numbers `addMonthSheet` in `server/src/eodExcel/buildWorkbook.js` writes for that month (same column order, same day rows, same summary block).
2. A new route `GET /api/public/eod-excel/tab/:slug/today` that lists every position of the tab's strategies that expires today, is scheduled to close today, or closed / expired today, with its legs, live marks, unrealized / realized P&L and the distance of its short strikes from the spot, as the app's own Overview shows them.

## Hard constraints

- Read-only. Never place, change or cancel an order, never call a broker beyond the quote reads the engines already make, never mutate an engine's store or state. Nothing here may feed an entry, an exit, a size or an order price.
- `API_VERSION` stays 1. Never rename, remove or retype an existing field of `kpi`, `strategies`, the envelope or `/tabs`. New things are new keys only.
- JSON-safe: `null` for a figure that does not exist, never `NaN`, `Infinity`, `undefined` or a `Map` (the existing `nul` helper in `server/src/eodExcel/dataApi.js` is the pattern). Money to 2 decimals where the workbook rounds (`round2`); a ROI fraction is left unrounded.
- The data route keeps its 30 s per-slug cache (`CACHE_TTL_MS`); the month filter runs on the cached analytics, so `?month=` never triggers another `analyze()`. The today route gets its own cache of about 10 s per slug (same `{ at, promise }` single-flight pattern, a rejected promise not remembered) and must NOT call `analyzeTab` / `analyze()`.
- Same middleware as today for both: the CORS block, the bearer token (`EOD_EXCEL_API_TOKEN`, constant-time compare), the failed-token limiter, `Cache-Control: no-store`, `405 GET only` for anything else. Add nothing that reads the token from the URL.
- Keep `createEodExcelDataRouter({ analyze, tabs, env, now, ttlMs, log })` injectable and add what the today route needs as further injectable options with production defaults (for example `today`, `todayTtlMs`), so the tests keep driving it with fakes and no engine.
- Commit when done (one or two commits with clear messages). Do not push.
- Use parallel subagents where the work is independent: one can build the `month` section + its tests while another explores the engines and builds the `today` route; a third can do the docs / Swagger / tunnel guard once the shapes are fixed. Review their diffs yourself before committing.

## Where the code lives (verified)

- `server/src/routes/eodExcelDataRouter.js`: `createEodExcelDataRouter({ analyze = analyzeTab, tabs = listDataTabs, env = () => process.env, now = Date.now, ttlMs = CACHE_TTL_MS, log = console.warn })`, exports `MIN_TOKEN_LENGTH`, `FAILURES_PER_MINUTE`, `CACHE_TTL_MS = 30_000`, `configuredTokens`, `tokenMatches`, `allowedOrigins`; routes `GET /tabs`, `GET /tab/:slug/data`, then `router.all(/.*/, ... 405)`. Mounted by `server/src/routes/healthSummaryRouter.js` as `router.use('/public/eod-excel', eodExcelDataRouter)`.
- `server/src/eodExcel/dataApi.js`: `API_VERSION = 1`; `SECTIONS = Object.freeze({ kpi: A => kpiObject(A.kpi), strategies: A => A.strategies.map(...).sort(...).map(... strategyRow ...) })`; `SECTION_NAMES = Object.keys(SECTIONS)`; `parseSections(value)` -> `{ sections }` or `{ error: 'Unknown section: x. Supported: kpi, strategies' }`; `buildTabData(A, { tab, currency, sections = SECTION_NAMES, now })` calls `SECTIONS[name](A)` per section. A section function today takes only `A`; the `month` one also needs the requested month and the tab's market, so extend the call (for example `SECTIONS[name](A, ctx)` with `ctx = { month, market, now }`) without changing the existing two.
- `server/src/eodExcel/service.js`: `analyzeTab(slug, { registry, readFunds, now })` -> `{ tab, currency, A }` or `null`; `collectTab`; `listDataTabs`; `eligibleTabs(reg)` (enabled, not archived, has adapters); `etFormat` / `istFormat` (`Intl.DateTimeFormat('en-CA', { timeZone })` for New York / Kolkata). Note `writeTabWorkbook` picks `todayMonth` with `etFormat` for every tab; the API's default month must follow the tab's market time zone (ET for US, IST for India) as the contract says.
- `server/src/eodExcel/analytics.js` `analyze(...)` returns `{ strategies: S, stats, kpi, days, ... }`: `days` = `[{ date: 'YYYY-MM-DD', net, trades, per: Map<strategyIndex, net> }]` ascending; `strategies[i]` = `{ name, underlying, capital, ... }` in column order.
- `server/src/eodExcel/buildWorkbook.js`: exported `monthsToShow(strategies, todayMonth)`; module-private `addMonthSheet(wb, { tabLabel, currency, A, month })`, the reference for every number: `days = A.days.filter(d => d.date.startsWith(month))`; `colSum[i] = round2(days.reduce((a, d) => a + (d.per.get(i) ?? 0), 0))`; capital shown only when `Number.isFinite(capital) && capital > 0`; ROI result `colSum[i] / capital` (unrounded), `''` without capital; profit / loss days = `nets.filter(v => v > 0).length` / `< 0`; TOTAL column `total = round2(sum colSum)`, `capSum` = sum of positive capitals, ROI `capSum ? total / capSum : ''`, day counts over `d.net`; each row writes `d.per.get(i) ?? 0`, `d.net`, `cum = round2(cum + d.net)`. Either export a pure `monthSheetData(A, month)` from this file and have `addMonthSheet` use it too (preferred: one source of numbers), or mirror it exactly in `dataApi.js` with a test that compares both.
- `server/src/lib/tunnelGuard.js` line 16: `const PUBLIC_EOD_DATA = /^\/api\/public\/eod-excel\/(?:tabs|tab\/[a-z0-9][a-z0-9-]{0,79}\/data)\/?$/i;` -> allow `today` too: `(?:tabs|tab\/[a-z0-9][a-z0-9-]{0,79}\/(?:data|today))`. Update the comment above it ("exactly these two paths" becomes three). `GET` and `OPTIONS` only, as now.
- `server/src/docs/paths/misc.js`: tag `EOD Excel` (description near line 38 says "the two data reads": make it three), `EOD_SLUG`, `EOD_PUBLIC_ERRORS` (~494-510), path objects `'/api/public/eod-excel/tabs'` and `'/api/public/eod-excel/tab/{slug}/data'` (~863-887). Add the `month` query parameter and the `month` section to the data path, and a new `'/api/public/eod-excel/tab/{slug}/today'` path, using the file's `op / json / fail / obj / arr / str / nstr / nnum / num / bool / anyObject` helpers.
- `docs/eod-excel.md`, section "Data API (JSON, 2026-10-31)": document the `month` section (`?month=`, `available`, the empty-month answer, the 400) and the `today` route (what qualifies, the row shape, which families cannot supply rows, the 10 s cache), plus the tunnel-guard sentence ("exactly these two paths" -> three) and two curl lines.
- Tests: `tests/server/eodExcel.test.js` (from ~line 528: `fakeTabs` with adapters built by `adapter(slug, history, extra)` at ~110, `fakeRegistry`, `dataApp({ env, analyze, ttlMs, clock, log })` at ~584 wrapping `createEodExcelDataRouter`, `withServer(router, fn)` at ~282, `AUTH`, `NOW = Date.parse('2026-10-30T20:05:00Z')`) and `tests/server/tunnelGuard.test.js` (the pass / refuse lists at ~219-245: add `GET /api/public/eod-excel/tab/simulator/today` and `OPTIONS .../today` to the pass list, `POST .../today` and `GET .../today/extra` to the refuse list). Run `npm run test:server`.

### Where today's positions and live figures come from (verified; name these helpers, do not reimplement them)

- Tab and strategies: `getAdapterRegistry()` from `server/src/services/strategyAdapters/index.js`, `listTabs()` -> tabs with `.slug`, `.label`, `.market`, `.adapters`; use `eligibleTabs` from `service.js` for the same 404 rule as the data route. Each adapter (`strategyAdapters/common.js` `defineAdapter`): `slug`, `displayName`, `family`, `market`, `instrument.symbol`, `strategyId`, `readHistory()` (the full ledger, newest first), `readConfig()` -> `{ config }`, `fetchRaw()` (the engine's own `getStatus()`), `normalize(raw)` -> `{ positions, marketOpen, symbol, ... }`, and, only on some families, `readOpenPositions()` (the engine state's open positions, no broker call): the US and India condor adapters (`condorAdapters.js` lines 66 and 111) and the Call Condor / Half Side / Premium Harvest family (`engineFamilies.js` line 93). Every other family has no `readOpenPositions` and gets no rows: say so in `note` (the sentence `collectTab` already uses for `positionsNote` is a good model, naming the strategies left out).
- Live marks and spot for the US condors come from the engine's `getStatus()` (`server/src/services/spxPremiumService.js`, `async function getStatus()` at ~4191, memoised 4 s by `createRefreshAheadMemo` from `server/src/lib/refreshAheadMemo.js`). Each status position carries: `legs[]` with `bid`, `ask`, `mid` (`midOf(q)`), `moneynessSteps`, `entryMoneynessSteps`, `entryMid`, `occSymbol`, `role`, `action`, `type`, `strike`; `costToClose`; `charges` (`openCondorCharges(position).total`); `unrealizedPnL = round2((entryCredit - costToClose) * 100 * quantity - charges)` or `null`; `liveSpot` and `liveDistance` (from `liveFields` in `server/src/lib/entryDistance.js`, measured against `preview.spot`); `dte`; `scheduledClose: { date, time, days, beyondExpiry }` when the "close after N trading days" rule is on; the payload also has `marketOpen` (`isUsMarketOpenNow()`), `estDate`, `estNow`, `preview.spot`. The Call Condor family's status (`server/src/services/callStrategyUsService.js`) carries the same kind of fields with `netPremium` instead of `entryCredit` (its max figures: `computeCallLegPayoffExtremes` / `computePutLegPayoffExtremes`). The simplest correct read is the adapter's `fetchRaw()` + `normalize()`; the shared single-flight wrapper over exactly that call is `getTabSnapshotService()` in `server/src/services/tabSnapshotService.js` (`getStrategy(slug, opts)`, `getTabStrategies(tabRef, slugs, opts)`, one compute per strategy per 4 s window; its record has `blocks.positions`, `marketOpen`, `instrument`). Prefer the snapshot service so the dashboard's polling shares the browser's computation instead of adding one. Do not use `dashboardData.js` `getOpenPositions` (that is the broker book of an env, not a strategy's positions).
- Pure helpers to reuse: `server/src/lib/livePositionMarks.js` (`midOf`, `usableQuote`, `computePositionMark`, `MULTIPLIER = 100`: the P&L convention), `server/src/lib/liveDistance.js` (`positionLiveDistance(position, spot)`, `positionUnderlying(position, fallback)`: SPXW -> SPX), `server/src/lib/entryDistance.js` (`computeDistance({ spot, strikes, legs, stepsBy })` -> `{ put?, call? }` each `{ points, pct, steps, strike, itm }`; `liveFields(position, spot)`; `legSteps(legs, 'entry' | 'live')`), `server/src/lib/scheduledClose.js` (`scheduledCloseSchedule({ position, config })` -> `{ date, time, days, beyondExpiry }` or null, `closeAfterDaysOf`, `closeTimeOf`), `server/src/lib/holdToExpiry.js` (`holdsToExpiry(config)`), `server/src/lib/marketHours.js` (`isMarketOpen('options')`, `isUsOptionsRegularWindowAt(ms)`), `strategyAdapters/common.js` (`isUsSessionOpenAt`, `MARKET_TIME_ZONE`, `dateInTimeZone`, `defaultClosedDateOf(row, timeZone)`), `server/src/lib/indiaMarketHours.js` (`isIndiaMarketOpen`), `server/src/lib/marketCalendar.js` (`marketCalendar().addTradingDays(market, date, n)`), `server/src/lib/round2.js`.
- Position record fields (condor, written at entry around `spxPremiumService.js` ~2071): `id, env, quantity, openedAt, openedDateEst, expiration, entrySpot, strikes { longPut, shortPut, shortCall, longCall }, putWidth, callWidth, entryCredit, entryNetDollars, maxRisk, entryCharge, legs [{ role, action, type, strike, occSymbol, entryMid, entryPlanned, entryExecuted, entryMoneynessSteps }], entry { spot, distance, selection, expectedMove }`. Ledger row (written at close around ~2245): the same plus `closedAt, closedDateEst, exitSpot, exit { spot, distance, reason }, exitCost, exitNetDollars, grossPnL, charges, realizedPnL, worstPnL, bestPnL, reason, detail, legs[].exitMid`. Default config (`server/src/services/spxPremiumStore.js` `DEFAULT_CONFIG`): `expiryCloseTimeEST: '15:00'`, `closeAfterTradingDays: null` (off), `closeTimeEST: '15:45'`, `holdToExpiry`.

## The exact contract

Both responses keep `version: 1`, the existing `tab` object (`{ slug, label, market, currency }`), amounts in the tab's currency net of charges, `null` for unknown figures.

### A. `month` section

`GET /api/public/eod-excel/tab/:slug/data?sections=month[&month=YYYY-MM]`; `sections=kpi,strategies,month` must work together (the envelope's `sections` lists what is present). Default month = the current month in the tab's market time zone (America/New_York for US, Asia/Kolkata for India).

```json
{
  "version": 1,
  "tab": { "slug": "tradier-sb-live", "label": "Tradier_SB Live", "market": "US", "currency": "USD" },
  "generatedAt": "2026-10-30T20:05:00.000Z",
  "asOf": "2026-10-30",
  "sections": ["month"],
  "month": {
    "month": "2026-10",
    "available": ["2026-10", "2026-09", "2026-08"],
    "columns": [
      { "name": "SB 0DTE P2", "underlying": "SPX", "capital": 50000 },
      { "name": "SB Weekly P11", "underlying": "SPX", "capital": 100000 }
    ],
    "days": [
      { "date": "2026-10-28", "values": [120.5, 0], "total": 120.5, "cumulative": 120.5 },
      { "date": "2026-10-29", "values": [-310, 84.2], "total": -225.8, "cumulative": -105.3 },
      { "date": "2026-10-30", "values": [58.8, 0], "total": 58.8, "cumulative": -46.5 }
    ],
    "summary": {
      "returns": [-130.7, 84.2],
      "capital": [50000, 100000],
      "roi": [-0.002614, 0.000842],
      "profitDays": [2, 1],
      "lossDays": [1, 0],
      "total": { "returns": -46.5, "capital": 150000, "roi": -0.00031, "profitDays": 2, "lossDays": 1 }
    }
  }
}
```

- `month`: `YYYY-MM` returned. `available`: `monthsToShow(A.strategies, currentMonth)` (newest first, the current month always present even without trades).
- `columns`: `A.strategies` in order: `{ name, underlying: string | null (null when empty), capital: number | null (null unless > 0) }`. The same columns for every month.
- `days`: `A.days.filter(d => d.date.startsWith(month))` ascending: `{ date, values: columns.map((_, i) => d.per.get(i) ?? 0), total: d.net, cumulative }` with `cumulative = round2(previous + total)`.
- `summary`: `returns[i] = round2(sum of values[i])`; `capital[i]` as in `columns`; `roi[i] = returns[i] / capital[i]` as a plain fraction (not rounded to 2 dp), `null` without capital; `profitDays[i]` / `lossDays[i]` = count of `values[i] > 0` / `< 0`; `total = { returns: round2(sum returns), capital: sum of the positive capitals or null when none, roi: returns / capital or null, profitDays / lossDays: count of days with total > 0 / < 0 }`.
- `month=` that is not `^\d{4}-(0[1-9]|1[0-2])$` -> `400 { error }`. A valid month not in `available` -> `200` with `days: []`, the full `columns`, and a zeroed summary (`returns` all 0, `roi` all null, counts 0, `total: { returns: 0, capital, roi: null, profitDays: 0, lossDays: 0 }`).
- Unknown section -> `400` naming the supported ones (now `kpi, strategies, month`); `404` for a tab without strategies; `401 / 429 / 503 / 405` unchanged.

### B. `today` route

`GET /api/public/eod-excel/tab/:slug/today`. Rows = every position of the tab's strategies that (a) is open and `expiration === date`, or (b) is open and its scheduled close falls today (`scheduledCloseSchedule({ position, config }).date === date` and not `beyondExpiry`, with the flavor's config from `adapter.readConfig()`; a position on its expiration day is already (a) whatever `holdToExpiry` says), or (c) closed or expired today (a ledger row whose closed date, `defaultClosedDateOf(row, timeZone)`, equals `date`). One row per position; a strategy with two positions gives two rows. `date` = today in the tab's market time zone.

```json
{
  "version": 1,
  "tab": { "slug": "tradier-sb-live", "label": "Tradier_SB Live", "market": "US", "currency": "USD" },
  "generatedAt": "2026-10-30T15:42:10.000Z",
  "date": "2026-10-30",
  "marketOpen": true,
  "spot": [{ "symbol": "SPX", "price": 6780.15, "asOf": "2026-10-30T15:42:08.000Z" }],
  "rows": [
    {
      "id": "spx-20261030-093205-a1b2",
      "strategy": "SB 0DTE P2",
      "underlying": "SPX",
      "status": "open",
      "expiration": "2026-10-30",
      "dte": 0,
      "quantity": 2,
      "structure": "Iron condor",
      "legs": [
        { "action": "buy",  "type": "put",  "strike": 6675, "quantity": 2, "expiration": null, "entryMid": 0.45, "mid": 0.20, "status": "open" },
        { "action": "sell", "type": "put",  "strike": 6700, "quantity": 2, "expiration": null, "entryMid": 1.05, "mid": 0.55, "status": "open" },
        { "action": "sell", "type": "call", "strike": 6850, "quantity": 2, "expiration": null, "entryMid": 1.10, "mid": 0.95, "status": "open" },
        { "action": "buy",  "type": "call", "strike": 6875, "quantity": 2, "expiration": null, "entryMid": 0.50, "mid": 0.45, "status": "open" }
      ],
      "entrySpot": 6772.4,
      "liveSpot": 6780.15,
      "openedAt": "2026-10-30T13:32:05.000Z",
      "closedAt": null,
      "exitReason": null,
      "distanceAtEntry": {
        "put":  { "points": 72.4, "pct": 1.07, "steps": 14 },
        "call": { "points": 77.6, "pct": 1.15, "steps": 16 }
      },
      "distanceNow": {
        "put":  { "points": 80.15, "pct": 1.18, "steps": 16, "breached": false },
        "call": { "points": 69.85, "pct": 1.03, "steps": 14, "breached": false }
      },
      "pnl": {
        "current": 58.8,
        "unrealized": 58.8,
        "realized": null,
        "entryCredit": 240,
        "maxProfit": 240,
        "maxRisk": 4760,
        "charges": 11.2,
        "markedAt": "2026-10-30T15:42:08.000Z"
      },
      "multiplier": 100
    },
    {
      "id": "spx-20261029-093204-c3d4",
      "strategy": "SB Weekly P11",
      "underlying": "SPX",
      "status": "closed",
      "expiration": "2026-10-30",
      "dte": 0,
      "quantity": 1,
      "structure": "Iron condor",
      "legs": [
        { "action": "buy",  "type": "put",  "strike": 6650, "quantity": 1, "expiration": null, "entryMid": 0.60, "mid": 0.05, "status": "closed" },
        { "action": "sell", "type": "put",  "strike": 6675, "quantity": 1, "expiration": null, "entryMid": 1.35, "mid": 0.15, "status": "closed" },
        { "action": "sell", "type": "call", "strike": 6875, "quantity": 1, "expiration": null, "entryMid": 1.25, "mid": 0.30, "status": "closed" },
        { "action": "buy",  "type": "call", "strike": 6900, "quantity": 1, "expiration": null, "entryMid": 0.55, "mid": 0.10, "status": "closed" }
      ],
      "entrySpot": 6755.9,
      "liveSpot": 6778.6,
      "openedAt": "2026-10-29T13:32:04.000Z",
      "closedAt": "2026-10-30T14:58:31.000Z",
      "exitReason": "profit-target",
      "distanceAtEntry": {
        "put":  { "points": 80.9, "pct": 1.2, "steps": 16 },
        "call": { "points": 119.1, "pct": 1.76, "steps": 24 }
      },
      "distanceNow": {
        "put":  { "points": 103.6, "pct": 1.53, "steps": 21, "breached": false },
        "call": { "points": 96.4, "pct": 1.42, "steps": 19, "breached": false }
      },
      "pnl": {
        "current": 108.4,
        "unrealized": null,
        "realized": 108.4,
        "entryCredit": 145,
        "maxProfit": 145,
        "maxRisk": 2355,
        "charges": 6.6,
        "markedAt": "2026-10-30T14:58:31.000Z"
      },
      "multiplier": 100
    }
  ],
  "note": null
}
```

Field rules:

- Envelope: `version` 1; `tab` as the data route; `generatedAt` ISO (the cache's time); `date` the market day; `marketOpen` boolean from the app's market-hours helper (`null` when it cannot be read); `spot` = one entry per distinct underlying of the rows with the price used for `liveSpot` / `distanceNow` and the ISO time it was read (`price: null`, `asOf: null` when unavailable); `rows`; `note` a sentence naming the strategies of the tab whose family cannot list positions or has no live mark, else `null`.
- Row: `id` = the position's id (the same on the ledger row). `strategy` = `adapter.displayName`. `underlying` via `positionUnderlying(position, adapter.instrument.symbol)` (SPXW -> SPX). `status` `"open"` | `"closed"`. `expiration` `YYYY-MM-DD`. `dte` = calendar days from `date` to `expiration` (0 = today). `quantity` = lots. `structure`: `"Iron condor"` for four legs sell put / buy put / sell call / buy call, `"Put credit spread"` / `"Call credit spread"` for two, `"Iron butterfly"` when both shorts share a strike, else a sensible short label or `null`.
- `legs`: ALL legs in the engine's order, each `{ action: "buy" | "sell", type: "put" | "call", strike, quantity: contracts = (leg.quantity ?? 1) * lots, expiration: null when it equals the position's (else YYYY-MM-DD), entryMid: leg.entryMid ?? null, mid: the live mid now (open row) or exitMid (closed row) or null, status: "open" | "closed" }`.
- `entrySpot` = `position.entrySpot ?? position.entry?.spot ?? null`. `liveSpot` = the spot used now (open) or the ledger's `exitSpot` (closed). `openedAt` / `closedAt` ISO or null. `exitReason` = the ledger's `reason` as recorded, null while open.
- `distanceAtEntry` = the stored `entry.distance` (`{ put?: { points, pct, steps }, call?: ... }`), each side only `points`, `pct`, `steps` (drop `strike` / `itm`); null when none. `distanceNow` = `liveFields(statusPosition, spot).liveDistance` (or `computeDistance({ spot, strikes, legs, stepsBy: legSteps(legs, 'live') })`) with each side `{ points, pct, steps, breached: itm === true }`; on a closed row the ledger's `exit.distance` with `breached` from its `itm`. `null` without a usable spot.
- `pnl`: `unrealized` = the status `unrealizedPnL` (open; null without quotes), `realized` = the ledger's `realizedPnL` (closed), `current` = whichever applies; `entryCredit` = `entryNetDollars` (fall back to `entryCredit * multiplier * quantity`; Call Condor: `netPremium`); `maxProfit` = the credit for a credit structure (`entryNetDollars`) or the family's own figure; `maxRisk` = `position.maxRisk`; `charges` = the status `charges` (open) or the ledger's `charges` (closed); `markedAt` = the ISO time of the quote batch / spot read (open) or `closedAt` (closed). `multiplier` = 100 for US; for India the instrument's lot size (or the `entryNetDollars / (entryCredit * quantity)` ratio `normalizePosition` in `server/src/eodExcel/trades.js` uses).
- A strategy whose family cannot supply rows is skipped and named in `note`; a strategy whose status read fails is named in `note` too and never turns the whole response into a 500.
- `404 { error: "no main tab '<slug>' with strategies" }` for an unknown / disabled / archived / empty tab; `401 / 429 / 503 / 405` as the data route; `500 { error }` only when nothing could be read.

## Tests to add (same files, same fakes)

- `dataApi`: `parseSections('month')`, `parseSections('kpi,strategies,month')`; the month section for the `fakeTabs` fixture (`sim`: A closed 100 on 2026-10-29 and -40 on 2026-10-30 with capital 1000, B closed 30 on 2026-10-30): `columns`, `days` with `values` / `total` / `cumulative`, `summary` incl. `roi` `[0.06, null]` and `total.roi`, `available` `['2026-10']` at `NOW`; a month without trades -> empty days and zeroed summary; `JSON.parse(JSON.stringify(body))` deep-equals `body`.
- Router: `?sections=month&month=2026-10` -> 200 with the section; `?month=2026-13` and `?month=Oct` -> 400; `?sections=kpi,strategies,month` -> all three present; a second month within the TTL does not call `analyze` again (count calls as the existing cache test does).
- Today route: inject a fake `today` reader (or a fake registry whose adapters return fixed status payloads / ledgers) and assert: the three qualifying cases produce rows and a yesterday-closed row does not; one row per position; the row shape above (every key present, nulls where unknown, `breached` true when the spot sits inside a short strike); `note` names a family without `readOpenPositions`; 404 for an unknown tab; token / 405 as the data route; one computation per slug within the 10 s TTL, a new one after; a failure is not cached.
- Tunnel guard: add the today path to the pass list (`GET`, `OPTIONS`) and `POST .../today`, `GET .../today/extra` to the refuse list.
- Keep the existing workbook tests green: the month sheets must still be byte-for-byte the same numbers (if you refactor `addMonthSheet` to share the pure function, run the whole `tests/server/eodExcel.test.js`).

## Acceptance checklist

- [ ] `npm run test:server` passes.
- [ ] `curl.exe -s -H "Authorization: Bearer <token>" "http://localhost:3000/api/public/eod-excel/tab/simulator/data?sections=month&month=2026-10"` returns `sections: ["month"]` and a `month` object whose `days` / `summary` match the `October 2026` sheet of `Ashwin - EOD DATA.xlsx` (compare three cells by hand: a strategy's Returns, the TOTAL Returns, the last CUMULATIVE).
- [ ] The same URL without `&month=` returns the current month; `&month=2026-13` returns 400; `?sections=kpi,strategies,month` returns all three keys.
- [ ] `curl.exe -s -H "Authorization: Bearer <token>" "http://localhost:3000/api/public/eod-excel/tab/simulator/today"` and `.../tab/tradier-sb-live/today` return the envelope with `date` = today (ET), `marketOpen`, `spot`, `rows` (during the session: `pnl.unrealized` and `distanceNow` filled for the condor rows; after the close: today's closed rows with `pnl.realized`), `note` null or a sentence.
- [ ] `curl.exe -s -o NUL -w "%{http_code}" -H "x-forwarded-for: 203.0.113.7" -H "x-forwarded-host: x.ngrok-free.dev" -H "x-forwarded-proto: https" -H "Authorization: Bearer <token>" "http://localhost:3000/api/public/eod-excel/tab/simulator/today"` is 200 (the tunnel guard lets it through), while the same with `-X POST` is 403 or 405 and `GET .../tab/simulator/today/extra` is 403.
- [ ] No engine store was written, no order placed, no new broker call outside the engines' existing status reads; `kpi` and `strategies` responses are byte-identical to before.
- [ ] `docs/eod-excel.md` and the Swagger (`server/src/docs/paths/misc.js`) describe both additions; `GET /api/docs` still loads.
- [ ] Committed, not pushed.
~~~~

## 4. After it is built

Nothing changes on the Payout Calculator side: `src/lib/server/trading-api.ts` and the Trading dashboard already call both additions and read exactly the shapes above.

1. In this app's environment set `TRADING_API_URL` to the tunnel's base address (for example `https://example.ngrok-free.app`, no trailing slash) and `TRADING_API_TOKEN` to one of the tokens configured as `EOD_EXCEL_API_TOKEN` in the trading app's `.env`.
2. Restart the trading app so the changed tunnel guard (`lib/tunnelGuard.js`) and the new route are live; the tunnel (ngrok, started by its `launch-app.bat`) must be running for the dashboard to reach it.
3. Open the Trading dashboard: the month stepper should show `available` months and the "Today" panel should list rows (or the trading app's `note`) once a position expires, closes or closed that day.

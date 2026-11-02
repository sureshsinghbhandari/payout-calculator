"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { money, number, signedMoney } from "./format";
import { canDrawPayoff } from "./payoff-legs";

/** The subset of a leg the payoff needs (plain and serialisable, so a server component can pass it). */
export interface PayoffLeg {
  action: "buy" | "sell";
  type: "put" | "call";
  strike: number;
  /** Contracts (already multiplied by the position's lots). */
  quantity: number;
  /** Mid price per share / index point at entry; null when the engine did not record it. */
  entryMid: number | null;
  status: "open" | "closed";
}

export interface PayoffDialogProps {
  title: string;
  currency: string;
  /** Contract multiplier (100 for US index / equity options). */
  multiplier: number;
  legs: PayoffLeg[];
  spot: number | null;
  entrySpot: number | null;
  entryCredit: number | null;
  maxProfit: number | null;
  maxRisk: number | null;
}

const SAMPLES = 200;

/** The position's P/L (in currency, all open legs) if the underlying settles at `price`. */
function pnlAt(legs: PayoffLeg[], multiplier: number, price: number): number {
  let total = 0;
  for (const leg of legs) {
    if (leg.status !== "open" || leg.entryMid === null) continue;
    const intrinsic = leg.type === "call" ? Math.max(0, price - leg.strike) : Math.max(0, leg.strike - price);
    const perUnit = leg.action === "sell" ? leg.entryMid - intrinsic : intrinsic - leg.entryMid;
    total += perUnit * leg.quantity * multiplier;
  }
  return total;
}

export interface PayoffCurve {
  points: { price: number; pnl: number }[];
  low: number;
  high: number;
  maxProfit: { price: number; pnl: number };
  maxLoss: { price: number; pnl: number };
  breakevens: number[];
  strikes: number[];
  /** Credit (positive) or debit (negative) paid at entry, in currency. */
  entryCredit: number;
}

/** Samples the payoff over a sensible price range (exported for tests; pure). */
export function computePayoff(legs: PayoffLeg[], multiplier: number, spot: number | null, entrySpot: number | null): PayoffCurve | null {
  if (!canDrawPayoff(legs)) return null;
  const open = legs.filter((leg) => leg.status === "open");
  const strikes = Array.from(new Set(open.map((leg) => leg.strike))).sort((a, b) => a - b);
  const lowest = strikes[0];
  const highest = strikes[strikes.length - 1];
  // The widest spread: the largest gap between adjacent strikes of the same
  // option type (a condor's wing); failing that, between any adjacent strikes.
  const widestGap = (values: number[]) => {
    const sorted = Array.from(new Set(values)).sort((a, b) => a - b);
    let gap = 0;
    for (let i = 1; i < sorted.length; i++) gap = Math.max(gap, sorted[i] - sorted[i - 1]);
    return gap;
  };
  let width = Math.max(
    widestGap(open.filter((leg) => leg.type === "put").map((leg) => leg.strike)),
    widestGap(open.filter((leg) => leg.type === "call").map((leg) => leg.strike)),
  );
  if (width <= 0) width = widestGap(strikes);
  if (width <= 0) width = Math.max(1, Math.abs(lowest) * 0.01);

  let low = lowest - 1.5 * width;
  let high = highest + 1.5 * width;
  for (const anchor of [spot, entrySpot]) {
    if (anchor !== null && Number.isFinite(anchor) && anchor > 0) {
      low = Math.min(low, anchor * 0.98);
      high = Math.max(high, anchor * 1.02);
    }
  }
  low = Math.max(0, low);
  if (high <= low) high = low + Math.max(1, width);

  // Evenly spaced samples plus the strikes themselves, so every kink is exact.
  const prices = new Set<number>();
  for (let i = 0; i <= SAMPLES; i++) prices.add(low + ((high - low) * i) / SAMPLES);
  for (const strike of strikes) if (strike >= low && strike <= high) prices.add(strike);
  const points = Array.from(prices)
    .sort((a, b) => a - b)
    .map((price) => ({ price, pnl: pnlAt(open, multiplier, price) }));

  let maxProfit = points[0];
  let maxLoss = points[0];
  for (const p of points) {
    if (p.pnl > maxProfit.pnl) maxProfit = p;
    if (p.pnl < maxLoss.pnl) maxLoss = p;
  }

  const breakevens: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.pnl === 0 && (i === 1 || points[i - 2].pnl !== 0)) breakevens.push(a.price);
    else if ((a.pnl < 0 && b.pnl > 0) || (a.pnl > 0 && b.pnl < 0)) {
      breakevens.push(a.price + ((b.price - a.price) * -a.pnl) / (b.pnl - a.pnl));
    }
  }

  let entryCredit = 0;
  for (const leg of open) entryCredit += (leg.action === "sell" ? 1 : -1) * (leg.entryMid ?? 0) * leg.quantity * multiplier;

  return { points, low, high, maxProfit, maxLoss, breakevens, strikes, entryCredit };
}

function priceLabel(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : number(value, 2);
}

/** "Nice" tick step for an axis: 1, 2, 5 × 10^n. */
function niceStep(range: number, ticks: number): number {
  const rough = range / Math.max(1, ticks);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const factor = residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1;
  return factor * magnitude;
}

const VIEW_W = 640;
const VIEW_H = 320;
const PAD = { top: 28, right: 20, bottom: 40, left: 64 };

function PayoffChart({ curve, currency, spot, entrySpot, title }: { curve: PayoffCurve; currency: string; spot: number | null; entrySpot: number | null; title: string }) {
  const clipId = useId();
  const plotW = VIEW_W - PAD.left - PAD.right;
  const plotH = VIEW_H - PAD.top - PAD.bottom;

  const yMaxRaw = Math.max(curve.maxProfit.pnl, 0);
  const yMinRaw = Math.min(curve.maxLoss.pnl, 0);
  const span = Math.max(yMaxRaw - yMinRaw, 1);
  const yMax = yMaxRaw + span * 0.12;
  const yMin = yMinRaw - span * 0.12;

  const x = (price: number) => PAD.left + ((price - curve.low) / (curve.high - curve.low)) * plotW;
  const y = (pnl: number) => PAD.top + ((yMax - pnl) / (yMax - yMin)) * plotH;
  const zeroY = y(0);

  const line = curve.points.map((p) => `${x(p.price).toFixed(1)},${y(p.pnl).toFixed(1)}`).join(" ");
  const area = `${x(curve.points[0].price).toFixed(1)},${zeroY.toFixed(1)} ${line} ${x(curve.points[curve.points.length - 1].price).toFixed(1)},${zeroY.toFixed(1)}`;

  const xStep = niceStep(curve.high - curve.low, 6);
  const xTicks: number[] = [];
  for (let v = Math.ceil(curve.low / xStep) * xStep; v <= curve.high + 1e-9; v += xStep) xTicks.push(Number(v.toFixed(6)));
  const yStep = niceStep(yMax - yMin, 4);
  const yTicks: number[] = [];
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax + 1e-9; v += yStep) yTicks.push(Number(v.toFixed(6)));

  const aboveId = `${clipId}-above`;
  const belowId = `${clipId}-below`;
  const inRange = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= curve.low && value <= curve.high;
  const spotMark = inRange(spot) ? spot : null;
  const entryMark = inRange(entrySpot) ? entrySpot : null;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="h-auto w-full text-slate-500"
      role="img"
      aria-label={`Payoff at expiration for ${title}: max profit ${signedMoney(curve.maxProfit.pnl, currency)}, max loss ${signedMoney(curve.maxLoss.pnl, currency)}${curve.breakevens.length ? `, breakeven at ${curve.breakevens.map(priceLabel).join(" and ")}` : ""}.`}
    >
      <defs>
        <clipPath id={aboveId}>
          <rect x={PAD.left} y={PAD.top} width={plotW} height={Math.max(0, zeroY - PAD.top)} />
        </clipPath>
        <clipPath id={belowId}>
          <rect x={PAD.left} y={zeroY} width={plotW} height={Math.max(0, PAD.top + plotH - zeroY)} />
        </clipPath>
      </defs>

      {/* Grid and axes */}
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)} className="stroke-slate-100" strokeWidth={1} />
          <text x={PAD.left - 8} y={y(v)} dy="0.35em" textAnchor="end" className="fill-current text-[11px]">
            {money(v, currency)}
          </text>
        </g>
      ))}
      {xTicks.map((v) => (
        <g key={`x${v}`}>
          <line x1={x(v)} x2={x(v)} y1={PAD.top + plotH} y2={PAD.top + plotH + 4} className="stroke-slate-300" strokeWidth={1} />
          <text x={x(v)} y={PAD.top + plotH + 16} textAnchor="middle" className="fill-current text-[11px]">
            {priceLabel(v)}
          </text>
        </g>
      ))}
      <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + plotH} className="stroke-slate-300" strokeWidth={1} />
      <line x1={PAD.left} x2={PAD.left + plotW} y1={PAD.top + plotH} y2={PAD.top + plotH} className="stroke-slate-300" strokeWidth={1} />

      {/* P/L area and line */}
      <polygon points={area} className="fill-emerald-500" fillOpacity={0.18} clipPath={`url(#${aboveId})`} />
      <polygon points={area} className="fill-red-500" fillOpacity={0.18} clipPath={`url(#${belowId})`} />
      <polyline points={line} fill="none" className="stroke-emerald-600" strokeWidth={2} clipPath={`url(#${aboveId})`} />
      <polyline points={line} fill="none" className="stroke-red-600" strokeWidth={2} clipPath={`url(#${belowId})`} />

      {/* Zero line */}
      <line x1={PAD.left} x2={PAD.left + plotW} y1={zeroY} y2={zeroY} className="stroke-slate-500" strokeWidth={1} />

      {/* Strikes */}
      {curve.strikes.map((strike) => (
        <g key={`k${strike}`}>
          <line x1={x(strike)} x2={x(strike)} y1={PAD.top} y2={PAD.top + plotH} className="stroke-slate-400" strokeWidth={1} strokeDasharray="4 3" />
          <text x={x(strike)} y={PAD.top - 8} textAnchor="middle" className="fill-current text-[10px]">
            {priceLabel(strike)}
          </text>
        </g>
      ))}

      {/* Entry spot (dotted) and current spot (solid) */}
      {entryMark !== null && (
        <g>
          <line x1={x(entryMark)} x2={x(entryMark)} y1={PAD.top} y2={PAD.top + plotH} className="stroke-slate-500" strokeWidth={1.25} strokeDasharray="1.5 3" />
          <text x={x(entryMark)} y={PAD.top + plotH - 6} dx={4} className="fill-current text-[10px]">
            entry {priceLabel(entryMark)}
          </text>
        </g>
      )}
      {spotMark !== null && (
        <g>
          <line x1={x(spotMark)} x2={x(spotMark)} y1={PAD.top} y2={PAD.top + plotH} className="stroke-blue-700" strokeWidth={1.5} />
          <text x={x(spotMark)} y={PAD.top + 12} dx={4} className="fill-blue-700 text-[10px] font-semibold">
            spot {priceLabel(spotMark)}
          </text>
        </g>
      )}

      {/* Breakevens */}
      {curve.breakevens.map((be) => (
        <g key={`be${be}`}>
          <circle cx={x(be)} cy={zeroY} r={3.5} className="fill-white stroke-slate-700" strokeWidth={1.5} />
          <text x={x(be)} y={zeroY + 14} textAnchor="middle" className="fill-slate-700 text-[10px] font-semibold">
            BE {priceLabel(be)}
          </text>
        </g>
      ))}

      {/* Max profit / max loss labels */}
      <text
        x={Math.min(Math.max(x(curve.maxProfit.price), PAD.left + 40), PAD.left + plotW - 40)}
        y={y(curve.maxProfit.pnl) - 6}
        textAnchor="middle"
        className="fill-emerald-700 text-[11px] font-semibold"
      >
        max {signedMoney(curve.maxProfit.pnl, currency)}
      </text>
      <text
        x={Math.min(Math.max(x(curve.maxLoss.price), PAD.left + 40), PAD.left + plotW - 40)}
        y={y(curve.maxLoss.pnl) + 14}
        textAnchor="middle"
        className="fill-red-700 text-[11px] font-semibold"
      >
        min {signedMoney(curve.maxLoss.pnl, currency)}
      </text>
    </svg>
  );
}

/**
 * An icon button that opens a modal <dialog> with the position's
 * at-expiration payoff graph (inline SVG, no chart library). Everything here
 * is derived from the legs' entry mids and strikes; the figures the other app
 * reports (max profit / risk, credit) are preferred for the summary when given.
 */
export function PayoffDialog(props: PayoffDialogProps) {
  const { title, currency, multiplier, legs, spot, entrySpot } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const headingId = useId();

  const curve = useMemo(() => computePayoff(legs, multiplier, spot, entrySpot), [legs, multiplier, spot, entrySpot]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = useCallback(() => setOpen(false), []);
  const onBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    // The dialog element itself is only hit when the click lands on the backdrop (the panel fills the rest).
    if (event.target === event.currentTarget) close();
  };

  if (!curve) return null;

  const maxProfit = props.maxProfit ?? curve.maxProfit.pnl;
  const maxLoss = props.maxRisk !== null && Number.isFinite(props.maxRisk) ? -Math.abs(props.maxRisk) : curve.maxLoss.pnl;
  const credit = props.entryCredit ?? curve.entryCredit;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Show payoff graph for ${title}`}
        title="Payoff graph"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
      >
        <svg viewBox="0 0 20 20" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 3v14h14" />
          <path d="M6 13l3.5-4 2.5 2.5L16 6" />
        </svg>
      </button>

      <dialog
        ref={dialogRef}
        onClose={close}
        onClick={onBackdropClick}
        aria-labelledby={headingId}
        className="m-auto w-[min(92vw,760px)] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={headingId} className="text-base font-semibold text-slate-900">
                Payoff at expiration
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">{title}</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close payoff graph"
              className="-mr-2 -mt-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
            >
              <svg viewBox="0 0 20 20" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>

          <div className="mt-4">{open && <PayoffChart curve={curve} currency={currency} spot={spot} entrySpot={entrySpot} title={title} />}</div>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Max profit</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-emerald-700">{signedMoney(maxProfit, currency)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Max loss</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-red-700">{signedMoney(maxLoss, currency)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Breakevens</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{curve.breakevens.length ? curve.breakevens.map(priceLabel).join(" / ") : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{credit >= 0 ? "Credit" : "Debit"}</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{money(Math.abs(credit), currency)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            Open legs only, at entry mids, before charges. Spot {spot !== null ? priceLabel(spot) : "—"}
            {entrySpot !== null && <> · entry spot {priceLabel(entrySpot)}</>}
          </p>
        </div>
      </dialog>
    </>
  );
}

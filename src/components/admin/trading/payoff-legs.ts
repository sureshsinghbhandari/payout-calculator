import type { PayoffLeg } from "./PayoffDialog";

// Lives outside PayoffDialog.tsx on purpose: that file is a client module, and a
// server component (TodayView) cannot call a function exported from one.

/** True when the at-expiration payoff can be drawn: at least one open leg, every open leg with a finite strike and entry mid. */
export function canDrawPayoff(legs: PayoffLeg[]): boolean {
  const open = legs.filter((leg) => leg.status === "open");
  return open.length > 0 && open.every((leg) => Number.isFinite(leg.strike) && leg.entryMid !== null && Number.isFinite(leg.entryMid));
}

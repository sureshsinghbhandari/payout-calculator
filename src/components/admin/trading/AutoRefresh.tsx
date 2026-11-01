"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** The time of the last refresh as shown in the admin: e.g. "3:04:17 PM EDT" (always US Eastern). */
const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "America/New_York",
  timeZoneName: "short",
});

/**
 * Re-renders the server components of the current route every `seconds`
 * seconds (router.refresh(), which keeps client state and scroll position)
 * while the tab is visible, and again as soon as it becomes visible after
 * being hidden. Does nothing while `enabled` is false (e.g. when the market
 * is closed and the figures cannot move).
 */
export function AutoRefresh({ seconds = 30, enabled = true }: { seconds?: number; enabled?: boolean }) {
  const router = useRouter();
  // The server's render time counts as the first "refresh"; the text differs
  // between server and client by a few seconds, hence suppressHydrationWarning.
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date());

  useEffect(() => {
    if (!enabled) return;
    const period = Math.max(5, seconds) * 1000;
    let lastRun = Date.now();

    const refresh = () => {
      lastRun = Date.now();
      router.refresh();
      setLastRefreshedAt(new Date());
    };
    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onVisibilityChange = () => {
      // Coming back to the tab after a while: catch up straight away instead of waiting for the next tick.
      if (document.visibilityState === "visible" && Date.now() - lastRun >= period) refresh();
    };

    const timer = window.setInterval(tick, period);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router, seconds, enabled]);

  return (
    <p className="text-xs text-slate-500" aria-live="off">
      {enabled ? `Refreshes every ${seconds} s` : "Auto-refresh paused"}
      {" · last "}
      <time dateTime={lastRefreshedAt.toISOString()} suppressHydrationWarning>
        {timeFormatter.format(lastRefreshedAt)}
      </time>
    </p>
  );
}

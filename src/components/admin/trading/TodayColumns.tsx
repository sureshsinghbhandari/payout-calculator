"use client";

import { useSyncExternalStore, type ReactNode } from "react";

/** The optional columns of the Today table, in table order. */
export const TODAY_COLUMN_OPTIONS = [
  { key: "position", label: "Today's position" },
  { key: "now", label: "Distance now" },
  { key: "entry", label: "Distance at entry" },
] as const;

type ColumnKey = (typeof TODAY_COLUMN_OPTIONS)[number]["key"];

const STORAGE_KEY = "trading-today-columns";
const CHANGED = "trading-today-columns-changed";

// Kept in memory too, so the choice still applies when the browser blocks storage.
let remembered = "";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function readChoice(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? remembered;
  } catch {
    return remembered;
  }
}

function writeChoice(keys: ColumnKey[]): void {
  remembered = JSON.stringify(keys);
  try {
    window.localStorage.setItem(STORAGE_KEY, remembered);
  } catch {
    // Not saved for later visits; the choice still applies until the page is closed.
  }
  window.dispatchEvent(new Event(CHANGED));
}

function parseChoice(raw: string): ColumnKey[] {
  try {
    const saved: unknown = JSON.parse(raw || "null");
    return Array.isArray(saved) ? TODAY_COLUMN_OPTIONS.map((o) => o.key).filter((key) => saved.includes(key)) : [];
  } catch {
    return [];
  }
}

/**
 * Wraps the Today table and lets each viewer choose which optional columns
 * to show (all hidden until chosen). The choice is kept in this browser. The
 * table itself stays a server component: its cells carry a class that hides
 * them while the wrapper's `data-hide` lists their column (see TodayView).
 */
export function TodayColumns({ children }: { children: ReactNode }) {
  // The server (and the first client render) show the default; the saved choice applies right after.
  const shown = parseChoice(useSyncExternalStore(subscribe, readChoice, () => ""));

  const toggle = (key: ColumnKey) => writeChoice(shown.includes(key) ? shown.filter((k) => k !== key) : [...shown, key]);

  const hidden = TODAY_COLUMN_OPTIONS.filter((o) => !shown.includes(o.key))
    .map((o) => o.key)
    .join(" ");

  return (
    <div data-hide={hidden} className="space-y-3">
      <div className="flex justify-end">
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700">
            Columns
          </summary>
          <fieldset className="absolute right-0 z-10 mt-1 w-52 space-y-1.5 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg">
            <legend className="sr-only">Show or hide columns</legend>
            {TODAY_COLUMN_OPTIONS.map((option) => (
              <label key={option.key} className="flex cursor-pointer items-center gap-2 text-slate-800">
                <input
                  type="checkbox"
                  checked={shown.includes(option.key)}
                  onChange={() => toggle(option.key)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-900 focus:ring-blue-700"
                />
                {option.label}
              </label>
            ))}
          </fieldset>
        </details>
      </div>
      {children}
    </div>
  );
}

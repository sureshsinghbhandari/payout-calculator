"use client";

/**
 * "Expand all / Collapse all" for a list of collapsible groups. The groups are plain <details data-group>
 * elements inside the element with id `targetId`; they start collapsed and are never opened by the page
 * itself, including when it refreshes.
 */
export function GroupToggle({ targetId }: { targetId: string }) {
  const setAll = (open: boolean) => {
    document.getElementById(targetId)?.querySelectorAll<HTMLDetailsElement>("details[data-group]").forEach((group) => {
      group.open = open;
    });
  };
  const button =
    "rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700";
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={button} onClick={() => setAll(true)}>
        Expand all
      </button>
      <button type="button" className={button} onClick={() => setAll(false)}>
        Collapse all
      </button>
    </div>
  );
}

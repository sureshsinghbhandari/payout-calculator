/**
 * Writes docs/UPCOMING-FEATURES.md from src/lib/roadmap.ts (the same list as
 * Settings > Upcoming features): a summary table first, then the details of
 * each feature, linked from the table. Screen layouts (text sketches) come
 * from docs/feature-layouts.ts.
 *
 *   npm run docs:features
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ROADMAP,
  ROADMAP_CATEGORY_LABELS,
  ROADMAP_CATEGORY_ORDER,
  ROADMAP_PRIORITY_LABELS,
  type RoadmapItem,
  type RoadmapPriority,
  type RoadmapStatus,
} from "../src/lib/roadmap";
import { APP_MAP, LAYOUTS } from "./feature-layouts";

const OUT = fileURLToPath(new URL("./UPCOMING-FEATURES.md", import.meta.url));

const STATUS_TEXT: Record<RoadmapStatus, string> = {
  "in-progress": "🔄 In progress",
  planned: "⏳ Pending",
  done: "✅ Done",
};
const STATUS_ORDER: RoadmapStatus[] = ["in-progress", "planned", "done"];
const SECTION_TITLES: Record<RoadmapStatus, string> = {
  "in-progress": "In progress",
  planned: "Pending",
  done: "Done",
};
const PRIORITY_ORDER: RoadmapPriority[] = ["now", "next", "later"];

const byId = new Map(ROADMAP.map((item) => [item.id, item]));

function sorted(items: RoadmapItem[]): RoadmapItem[] {
  return [...items].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
      ROADMAP_CATEGORY_ORDER.indexOf(a.category) - ROADMAP_CATEGORY_ORDER.indexOf(b.category),
  );
}

/** Pipes would break a table cell. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

function link(item: RoadmapItem): string {
  return `[${item.title}](#${item.id})`;
}

/** What the owner has to give, for the summary column. */
function fromYouCell(item: RoadmapItem): string {
  return item.fromYou && item.status !== "done" ? cell(item.fromYou) : "—";
}

function details(item: RoadmapItem): string[] {
  const lines = [
    `<a id="${item.id}"></a>`,
    "",
    `### ${item.title}`,
    "",
    `**Status:** ${STATUS_TEXT[item.status]} · **Priority:** ${ROADMAP_PRIORITY_LABELS[item.priority]} · **Area:** ${ROADMAP_CATEGORY_LABELS[item.category]}`,
    "",
    item.description,
  ];
  if (item.fromYou && item.status !== "done") lines.push("", `**Needs from you:** ${item.fromYou}`);
  if (item.outcome) lines.push("", `**Outcome:** ${item.outcome}`);
  if (item.dependsOn?.length) {
    const deps = item.dependsOn.map((id) => {
      const dep = byId.get(id);
      return dep ? `${link(dep)} (${STATUS_TEXT[dep.status]})` : id;
    });
    lines.push("", `**Depends on:** ${deps.join(", ")}`);
  }
  if (item.needs?.length) lines.push("", "**Needs:**", "", ...item.needs.map((n) => `- ${n}`));
  const layout = LAYOUTS[item.id];
  if (layout) lines.push("", "**Layout** (a sketch, not a screenshot):", "", "```text", layout, "```");
  lines.push("", "[Back to the table](#summary)", "");
  return lines;
}

const items = sorted(ROADMAP);
const count = (status: RoadmapStatus) => ROADMAP.filter((i) => i.status === status).length;
const waiting = items.filter((i) => i.fromYou && i.status !== "done");

const md = [
  "# Upcoming features",
  "",
  "What the Investment Payout Calculator already does, what is being built, and what is planned.",
  "The same list is in the app under **Settings > Upcoming features** (Master Admin).",
  "",
  "This file is generated from `src/lib/roadmap.ts`. To change it, edit that file and run",
  "`npm run docs:features`.",
  "",
  `**${count("done")} done · ${count("in-progress")} in progress · ${count("planned")} pending** · ${waiting.length} [waiting on you](#waiting-on-you)`,
  "",
  "Priority: **Now** is being worked on or needed first, **Next** comes after that, **Later** is for the future.",
  "",
  '<a id="summary"></a>',
  "",
  "## Summary",
  "",
  "| # | Feature | Status | Priority | Area | Needs from you |",
  "| --- | --- | --- | --- | --- | --- |",
  ...items.map(
    (item, i) =>
      `| ${i + 1} | ${cell(link(item))} | ${STATUS_TEXT[item.status]} | ${ROADMAP_PRIORITY_LABELS[item.priority]} | ${ROADMAP_CATEGORY_LABELS[item.category]} | ${fromYouCell(item)} |`,
  ),
  "",
  '<a id="waiting-on-you"></a>',
  "",
  "## Waiting on you",
  "",
  "These cannot be finished without access, an account, a key, wording or a decision from you.",
  "Everything else in the list can be built without your help.",
  "",
  "| # | Feature | Status | What is needed from you |",
  "| --- | --- | --- | --- |",
  ...waiting.map((item, i) => `| ${i + 1} | ${cell(link(item))} | ${STATUS_TEXT[item.status]} | ${cell(item.fromYou ?? "")} |`),
  "",
  '<a id="app-map"></a>',
  "",
  "## Where things are",
  "",
  "Every screen of the app and its address. Under **Details** below, each feature that has a",
  "screen also has a layout sketch. The sketches show what is on the page and where; the",
  "exact wording, colours and spacing differ. Features that are still pending have no sketch yet.",
  "",
  "```text",
  APP_MAP,
  "```",
  "",
  ...STATUS_ORDER.flatMap((status) => {
    const group = items.filter((i) => i.status === status);
    return group.length === 0 ? [] : [`## ${SECTION_TITLES[status]}`, "", ...group.flatMap(details)];
  }),
].join("\n");

writeFileSync(OUT, md);
console.log(`Wrote ${OUT} (${ROADMAP.length} features).`);

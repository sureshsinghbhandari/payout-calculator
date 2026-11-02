/**
 * One-time (and any-time) sync of the Trading dashboard's saved copies.
 *
 * Reads Overview, every month sheet and today's positions of Ashwin and
 * Suresh_Live from the trading app (tradiersuinew) while it is running,
 * and saves them in this project's private Blob storage. After that the
 * dashboard shows them, with a "copy saved ..." notice, whenever the trading
 * app is off. Read-only on the trading app's side.
 *
 *   npm run trading:sync
 *   npm run trading:sync -- --url https://your-tunnel.ngrok-free.app
 *   npm run trading:sync -- --env local        (saves under the local folder instead of production)
 *
 * Where things come from (nothing is printed):
 *   - BLOB_READ_WRITE_TOKEN: the environment, else .env.local.
 *   - TRADING_API_URL: --url, else the environment, else http://localhost:3000.
 *   - TRADING_API_TOKEN: the environment, else EOD_EXCEL_API_TOKEN in the
 *     trading app's own .env (folder: TRADING_REPO, else C:/MyGithub/tradiersuinew).
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
}

/** One KEY=value line of a dotenv file (quotes stripped), or undefined. */
function fromDotenv(file: string, key: string): string | undefined {
  if (!fs.existsSync(file)) return undefined;
  const match = fs.readFileSync(file, "utf8").match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, "m"));
  if (!match) return undefined;
  return match[1].trim().replace(/^(["'])(.*)\1$/, "$2") || undefined;
}

const root = path.resolve(import.meta.dirname, "..");
const tradingRepo = process.env.TRADING_REPO || "C:/MyGithub/tradiersuinew";
const target = arg("env") === "local" ? "local" : "production";

process.env.VERCEL_ENV = target === "production" ? "production" : "";
process.env.BLOB_READ_WRITE_TOKEN ||= fromDotenv(path.join(root, ".env.local"), "BLOB_READ_WRITE_TOKEN");
process.env.TRADING_API_URL = (arg("url") || process.env.TRADING_API_URL || "http://localhost:3000").replace(/\/+$/, "");
process.env.TRADING_API_TOKEN ||= fromDotenv(path.join(tradingRepo, ".env"), "EOD_EXCEL_API_TOKEN");

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("No BLOB_READ_WRITE_TOKEN found (environment or .env.local). Run: npx vercel env pull");
  process.exit(1);
}
if (!process.env.TRADING_API_TOKEN) {
  console.error(`No TRADING_API_TOKEN found, and no EOD_EXCEL_API_TOKEN in ${path.join(tradingRepo, ".env")}.`);
  process.exit(1);
}

// The app must answer before anything is attempted, so a stopped app gives one clear message.
try {
  const response = await fetch(`${process.env.TRADING_API_URL}/api/public/eod-excel/tabs`, {
    headers: { Authorization: `Bearer ${process.env.TRADING_API_TOKEN}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`answered ${response.status}`);
} catch (error) {
  console.error(`The trading app did not answer at ${process.env.TRADING_API_URL} (${(error as Error).message}).`);
  console.error("Start the trading app (tradiersuinew), then run this again. Nothing was changed.");
  process.exit(1);
}

const { TRADING_ACCOUNTS } = await import(pathToFileURL(path.join(root, "src/lib/trading-accounts.ts")).href);
const { refreshSnapshots, isSnapshotStorageConfigured } = await import(pathToFileURL(path.join(root, "src/lib/server/trading-snapshots.ts")).href);
if (!isSnapshotStorageConfigured()) {
  console.error("Blob storage is not configured.");
  process.exit(1);
}

console.log(`Saving copies from ${process.env.TRADING_API_URL} into the ${target} folder...`);
let problems = 0;
for (const account of TRADING_ACCOUNTS) {
  const result = await refreshSnapshots(account.slug, { everything: true });
  const months = result.saved.filter((name: string) => name.startsWith("month-")).length;
  console.log(
    `${account.label}: saved overview${result.saved.includes("overview") ? "" : " (FAILED)"}, ${months} month sheet${months === 1 ? "" : "s"}, today${result.saved.includes("today") ? "" : " (not available)"}.`,
  );
  const missing = result.failed.filter((name: string) => name !== "today");
  if (missing.length > 0) {
    problems += missing.length;
    console.log(`  not saved: ${missing.join(", ")}`);
  }
}
console.log(problems === 0 ? "Done." : "Done, with the problems above.");
process.exit(problems === 0 ? 0 : 1);

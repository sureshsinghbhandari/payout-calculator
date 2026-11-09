#!/usr/bin/env node
/**
 * Deploys the current commit to exactly ONE hosting provider.
 *
 *   npm run deploy -- --provider=vercel|netlify|cloudflare
 *   npm run deploy:vercel | deploy:netlify | deploy:cloudflare
 *
 * Options:
 *   --url=<https://...>   address to health-check when the CLI does not print one
 *   --skip-checks         skip typecheck, lint and tests (not recommended)
 *   --allow-dirty         deploy even with uncommitted changes (not recommended)
 *   --preview             Vercel and Netlify: deploy to a preview address instead of production
 *
 * It never changes DNS and never deploys to the other providers. Providers you do not deploy to stay idle.
 * Passing every step, including a healthy /api/health, is the only thing reported as success.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PROVIDERS = ["vercel", "netlify", "cloudflare"];
// Pinned, so a deploy never depends on whatever "latest" happens to be that day.
const CLI = { vercel: "vercel@65.12.1", netlify: "netlify-cli@27.16.2" };

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const provider = String(args.provider ?? "").toLowerCase();

function stop(message) {
  console.error(`\nSTOPPED: ${message}`);
  process.exit(1);
}

/** Runs a command, streaming its output; returns { status, output }. */
function run(command, options = {}) {
  console.log(`\n$ ${command}`);
  const result = spawnSync(command, { shell: true, encoding: "utf8", stdio: ["inherit", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return { status: result.status ?? 1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

function quiet(command) {
  return spawnSync(command, { shell: true, encoding: "utf8" }).stdout?.trim() ?? "";
}

// 1. Provider argument -------------------------------------------------------
if (!PROVIDERS.includes(provider)) {
  stop(`--provider must be one of: ${PROVIDERS.join(", ")} (got "${provider || "nothing"}").\nExample: npm run deploy -- --provider=netlify`);
}
console.log(`Deploying to ${provider.toUpperCase()} only. The other providers are not touched.`);

// 2. Same commit everywhere -------------------------------------------------
const commit = quiet("git rev-parse --short HEAD");
const branch = quiet("git rev-parse --abbrev-ref HEAD");
const dirty = quiet("git status --porcelain");
if (dirty && !args["allow-dirty"]) {
  stop("There are uncommitted changes. Commit them first so what you deploy is exactly one commit (or pass --allow-dirty).");
}
console.log(`Commit ${commit} on branch ${branch}${dirty ? " (DIRTY)" : ""}`);

// 3. Provider tools and login ------------------------------------------------
if (provider === "vercel") {
  if (!existsSync(".vercel/project.json") && !(process.env.VERCEL_PROJECT_ID && process.env.VERCEL_ORG_ID)) {
    stop("This folder is not linked to a Vercel project. Run: npx vercel link (or set VERCEL_ORG_ID, VERCEL_PROJECT_ID and VERCEL_TOKEN).");
  }
} else if (provider === "netlify") {
  if (!existsSync(".netlify/state.json") && !process.env.NETLIFY_SITE_ID) {
    stop("This folder is not linked to a Netlify site. Run: npx netlify-cli link (or set NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN).");
  }
} else if (provider === "cloudflare") {
  // The Cloudflare adapter creates symbolic links while bundling. Windows only allows that in
  // Developer Mode (or as administrator), and the adapter is not supported on native Windows.
  try {
    const dir = mkdtempSync(join(tmpdir(), "symlink-check-"));
    writeFileSync(join(dir, "a"), "");
    symlinkSync(join(dir, "a"), join(dir, "b"));
    rmSync(dir, { recursive: true, force: true });
  } catch {
    stop(
      "This machine cannot create symbolic links, which the Cloudflare build needs (typical on Windows).\n" +
        "Use the manual GitHub Action instead (Actions > Deploy one provider > Run workflow > cloudflare),\n" +
        "or turn on Windows Developer Mode (Settings > System > For developers) and run this again.",
    );
  }
  const who = run("npx wrangler whoami");
  if (who.status !== 0 || /not authenticated/i.test(who.output)) {
    stop("Not logged in to Cloudflare. Run: npx wrangler login (or set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID).");
  }
}

// 4. Type check, lint, tests --------------------------------------------------
if (!args["skip-checks"]) {
  for (const script of ["typecheck", "lint", "test"]) {
    if (run(`npm run ${script}`).status !== 0) stop(`"npm run ${script}" failed. Nothing was deployed.`);
  }
} else {
  console.log("\n(!) Checks skipped on request.");
}

// 5. Build and deploy ONLY the selected provider -------------------------------
let output = "";
if (provider === "vercel") {
  // Vercel builds on its own servers with the project's settings and environment variables.
  const result = run(`npx --yes ${CLI.vercel} deploy ${args.preview ? "" : "--prod "}--yes`);
  if (result.status !== 0) stop("Vercel deployment failed.");
  output = result.output;
} else if (provider === "netlify") {
  // `--build` runs the Netlify build locally with the site's environment variables, then uploads it.
  const result = run(`npx --yes ${CLI.netlify} deploy --build ${args.preview ? "" : "--prod "}--json`);
  if (result.status !== 0) stop("Netlify build or deployment failed.");
  output = result.output;
} else {
  if (run("npm run build:cloudflare").status !== 0) stop("The Cloudflare build failed. Nothing was deployed.");
  const result = run("npx opennextjs-cloudflare deploy");
  if (result.status !== 0) stop("Cloudflare deployment failed.");
  output = result.output;
}

// 6. Health check --------------------------------------------------------------
let url = typeof args.url === "string" ? args.url : "";
if (!url) {
  if (provider === "netlify") {
    const json = output.match(/"(?:url|deploy_url)"\s*:\s*"(https:[^"]+)"/);
    url = json?.[1] ?? "";
  } else if (provider === "cloudflare") {
    url = output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i)?.[0] ?? "";
  } else {
    url = output.match(/https:\/\/[a-z0-9.-]+\.vercel\.app/i)?.[0] ?? "";
  }
}

let health = "not checked (no deployment URL available; pass --url=https://...)";
let healthy = false;
let protectedByLogin = false;
if (url) {
  const target = `${url.replace(/\/$/, "")}/api/health`;
  console.log(`\nChecking ${target}`);
  for (let attempt = 1; attempt <= 6 && !healthy; attempt++) {
    try {
      const response = await fetch(target, { cache: "no-store" });
      const body = await response.text();
      health = `HTTP ${response.status} ${body.slice(0, 300)}`;
      healthy = response.status === 200 && /"status"\s*:\s*"ok"/.test(body);
      if (response.status === 401 || response.status === 403) { protectedByLogin = true; break; }
    } catch (error) {
      health = `unreachable (${error.message})`;
    }
    if (!healthy && attempt < 6) await new Promise((r) => setTimeout(r, 5000));
  }
}

console.log("\n==================== Deployment report ====================");
console.log(`Provider : ${provider}`);
console.log(`Commit   : ${commit}${dirty ? " (dirty)" : ""}`);
console.log(`URL      : ${url || "unknown"}`);
console.log(`Health   : ${health}`);
console.log("DNS      : not changed (switch it yourself when the checks pass; see docs/MULTI_PROVIDER.md)");
console.log("===========================================================");
if (!url) {
  console.log("\nDeployed, but NOT verified: no URL to check. Open the provider dashboard, then run the health check yourself.");
  process.exit(0);
}
if (protectedByLogin) {
  console.log("\nDeployed. The address is protected by a login (for example Vercel Deployment Protection), so the health check could not run from here.");
  console.log("Open it in your browser while signed in and check /api/health yourself.");
  process.exit(0);
}
if (!healthy) stop("Deployed, but the health check did NOT pass. Do not switch traffic to this deployment.");
console.log("\nSUCCESS: deployed and healthy.");

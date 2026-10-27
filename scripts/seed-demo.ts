/**
 * Demo data: 7 inquiries (new, contacted, converted), 2 deleted inquiries and
 * 3 investors, with notes, calls, meetings and their activity.
 *
 *   npm run seed:demo -- <local|preview|production>            adds or refreshes it
 *   npm run seed:demo -- <local|preview|production> --remove   removes it
 *
 * Needs BLOB_READ_WRITE_TOKEN (from .env.local, written by `vercel env pull`).
 * Everything it writes is marked as demo data (inquiry references DE30000x,
 * investor ids inv_demo…, audit ids demo-…), so it only ever replaces or
 * removes its own records. Investors get no password and cannot sign in.
 */
import { BlobError, BlobPreconditionFailedError, del, get, list, put } from "@vercel/blob";
import { ROLE_LABELS, type AdminRole, type Investor } from "../src/lib/accounts";
import { auditMonth, parseAuditEvents, type AuditActor, type AuditEvent } from "../src/lib/audit";
import { formatDollars } from "../src/lib/format";
import {
  DEFAULT_LEAD_SOURCE,
  inquiryReference,
  makeInquiryId,
  NOTE_PREVIEW_LENGTH,
  type InquiryStatus,
  type StoredInquiry,
} from "../src/lib/inquiry";
import type { InquiryLog, InquiryNote, InquiryNoteKind } from "../src/lib/inquiry-log";
import type { PayoutFrequency, PayoutType } from "../src/lib/payout";
import { defaultRateTable, parseStoredRates, type RateTable } from "../src/lib/rates";
import { buildScenarios } from "../src/lib/scenarios";

const env = process.argv[2];
const remove = process.argv.includes("--remove");
if (env !== "local" && env !== "preview" && env !== "production") {
  console.error("Usage: npm run seed:demo -- <local|preview|production> [--remove]");
  process.exit(1);
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN is not set. Run `npx vercel env pull .env.local` first.");
  process.exit(1);
}

const paths = {
  inquiries: `inquiries/${env}/`,
  logs: `inquiry-log/${env}/`,
  audit: `audit/${env}/`,
  investors: `accounts/${env}/investors.json`,
  rates: env === "production" ? "config/interest-rates.json" : `config/${env}/interest-rates.json`,
};
const DEMO_HEX = "de3000";
const isDemoInvestor = (id: string) => id.startsWith("inv_demo");
const isDemoEvent = (e: AuditEvent) => e.id.startsWith("demo-");

// ---------- people ----------

const admins: Record<"ashwin" | "suresh", AuditActor> = {
  ashwin: admin("adm_apatel", "Ashwin Patel", "apatel", "master"),
  suresh: admin("adm_sbhandari", "Suresh Bhandari", "sbhandari", "sales"),
};

function admin(id: string, name: string, username: string, role: AdminRole): AuditActor {
  return { kind: "admin", id, name, username, role };
}

// ---------- the demo inquiries ----------

interface DemoNote {
  daysAgo: number;
  hour: number;
  kind: InquiryNoteKind;
  by: keyof typeof admins;
  text: string;
}

interface DemoInquiry {
  n: number;
  name: string;
  email: string;
  phone: string;
  message: string;
  daysAgo: number;
  hour: number;
  principal: number;
  lockInYears: number;
  frequency: PayoutFrequency;
  payoutType: PayoutType;
  investInDays: number;
  status: InquiryStatus;
  /** When an admin marked it contacted / converted / deleted (days ago). */
  contactedDaysAgo?: number;
  doneDaysAgo?: number;
  statusBeforeDelete?: "new" | "contacted";
  investor?: { username: string };
  /** Lead source; the website when not set. */
  source?: string;
  notes: DemoNote[];
}

const INQUIRIES: DemoInquiry[] = [
  {
    n: 1, name: "Priya Sharma", email: "priya.sharma@example.com", phone: "+1 (555) 010-1001",
    message: "Is the rate fixed for the whole term? I would like to start next month.",
    daysAgo: 0, hour: 9, principal: 50_000, lockInYears: 3, frequency: "quarterly", payoutType: "interest-only",
    investInDays: 30, status: "new", notes: [],
  },
  {
    n: 2, name: "Daniel Brooks", email: "dbrooks@example.com", phone: "",
    message: "", daysAgo: 1, hour: 15, principal: 25_000, lockInYears: 2, frequency: "yearly",
    payoutType: "interest-and-principal", investInDays: 14, status: "new", notes: [],
  },
  {
    n: 3, name: "Meera Iyer", email: "meera.iyer@example.com", phone: "+1 (555) 010-1003",
    message: "Please call me in the evening.",
    daysAgo: 2, hour: 11, principal: 100_000, lockInYears: 5, frequency: "half-yearly", payoutType: "interest-only",
    investInDays: 45, status: "new",
    notes: [{ daysAgo: 1, hour: 18, kind: "call", by: "suresh", text: "No answer, left a voicemail. Try again tomorrow evening." }],
  },
  {
    n: 4, name: "Robert Chen", email: "robert.chen@example.com", phone: "+1 (555) 010-1004",
    message: "Comparing a few options for my retirement savings.",
    daysAgo: 5, hour: 10, principal: 75_000, lockInYears: 3, frequency: "half-yearly",
    payoutType: "interest-and-principal", investInDays: 21, status: "contacted", contactedDaysAgo: 4,
    notes: [
      { daysAgo: 4, hour: 14, kind: "call", by: "suresh", text: "Spoke for 15 minutes. Wants half-yearly payouts; asked about early withdrawal." },
      { daysAgo: 2, hour: 16, kind: "meeting", by: "ashwin", text: "Met at the office with his wife. Will decide after talking to their accountant." },
      { daysAgo: 1, hour: 9, kind: "note", by: "suresh", text: "Follow up on Friday." },
    ],
  },
  {
    n: 5, name: "Anita Desai", email: "anita.desai@example.com", phone: "+1 (555) 010-1005",
    message: "", daysAgo: 8, hour: 13, principal: 40_000, lockInYears: 1, frequency: "quarterly",
    payoutType: "interest-only", investInDays: 10, status: "contacted", contactedDaysAgo: 7,
    notes: [{ daysAgo: 7, hour: 12, kind: "call", by: "suresh", text: "Interested, but only for one year. Sent the plan details again." }],
  },
  {
    n: 6, name: "James Wilson", email: "james.wilson@example.com", phone: "+1 (555) 010-1006",
    message: "Saw you at the seminar on Saturday.",
    daysAgo: 16, hour: 10, principal: 120_000, lockInYears: 5, frequency: "yearly", payoutType: "interest-only",
    investInDays: 7, status: "converted", contactedDaysAgo: 15, doneDaysAgo: 10, investor: { username: "jwilson" },
    source: "seminar-2026-10",
    notes: [
      { daysAgo: 15, hour: 11, kind: "call", by: "suresh", text: "Ready to invest. Booked a meeting to sign." },
      { daysAgo: 10, hour: 15, kind: "meeting", by: "ashwin", text: "Signed. Funds arrive this week." },
    ],
  },
  {
    n: 7, name: "Kavita Rao", email: "kavita.rao@example.com", phone: "+1 (555) 010-1007",
    message: "", daysAgo: 20, hour: 17, principal: 60_000, lockInYears: 3, frequency: "quarterly",
    payoutType: "interest-and-principal", investInDays: 5, status: "converted", contactedDaysAgo: 19, doneDaysAgo: 13,
    investor: { username: "krao" },
    notes: [{ daysAgo: 19, hour: 10, kind: "call", by: "suresh", text: "Asked for quarterly payouts with principal back each quarter." }],
  },
  {
    n: 8, name: "Mark Thompson", email: "mark.t@example.com", phone: "+1 (555) 010-1008",
    message: "", daysAgo: 11, hour: 9, principal: 30_000, lockInYears: 2, frequency: "quarterly", payoutType: "interest-only",
    investInDays: 20, status: "deleted", doneDaysAgo: 9, statusBeforeDelete: "new",
    notes: [{ daysAgo: 10, hour: 10, kind: "note", by: "suresh", text: "Sent twice by mistake; the same person as another inquiry." }],
  },
  {
    n: 9, name: "Test User", email: "test@example.com", phone: "",
    message: "test", daysAgo: 6, hour: 22, principal: 1_000, lockInYears: 1, frequency: "yearly", payoutType: "interest-only",
    investInDays: 3, status: "deleted", doneDaysAgo: 6, statusBeforeDelete: "new", notes: [],
  },
];

/** An investor added directly (an existing customer, not from an inquiry). */
const DIRECT_INVESTOR = {
  name: "Rajesh Kumar", username: "rkumar", email: "rajesh.kumar@example.com", phone: "+1 (555) 010-1010",
  daysAgo: 25,
  investments: [
    { principal: 200_000, lockInYears: 5, frequency: "half-yearly" as const, payoutType: "interest-only" as const, daysAgo: 25 },
    { principal: 50_000, lockInYears: 2, frequency: "quarterly" as const, payoutType: "interest-and-principal" as const, daysAgo: 3 },
  ],
};

// ---------- helpers ----------

const now = new Date();

function at(daysAgo: number, hour: number, minute = 0): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, minute, 0, 0);
  // Never in the future (today's entries before the current time).
  return d > now ? new Date(now.getTime() - 60_000 * (60 - minute)) : d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function plusDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

let counter = 0;
function demoId(): string {
  counter += 1;
  return `demo-${String(counter).padStart(4, "0")}`;
}

async function readJson(path: string): Promise<{ data: unknown; etag: string | null }> {
  const result = await get(path, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return { data: null, etag: null };
  return { data: JSON.parse(await new Response(result.stream).text()), etag: result.blob.etag.replace(/^W\//, "") };
}

async function writeJson(path: string, value: unknown, etag: string | null): Promise<void> {
  await put(path, JSON.stringify(value, null, 2), {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/json",
    ...(etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false }),
  });
}

/** Read, change, write with the ETag, retried when the app changed the file meanwhile. */
async function mutate(path: string, change: (data: unknown) => unknown): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const { data, etag } = await readJson(path);
    try {
      await writeJson(path, change(data), etag);
      return;
    } catch (error) {
      const conflict =
        error instanceof BlobPreconditionFailedError || (error instanceof BlobError && /already exists/i.test(error.message));
      if (!conflict || attempt >= 5) throw error;
    }
  }
}

async function listPaths(prefix: string): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    out.push(...page.blobs.map((b) => b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

async function readRates(): Promise<RateTable> {
  const result = await get(paths.rates, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return defaultRateTable();
  return parseStoredRates(await new Response(result.stream).text()).rates;
}

// ---------- remove ----------

async function removeDemo(): Promise<void> {
  const demoFiles = [...(await listPaths(paths.inquiries)), ...(await listPaths(paths.logs))].filter((p) =>
    new RegExp(`-${DEMO_HEX}\\d{2}\\.json$`).test(p),
  );
  if (demoFiles.length > 0) await del(demoFiles);

  if ((await readJson(paths.investors)).data) {
    await mutate(paths.investors, (data) => {
      const investors = ((data as { investors?: Investor[] })?.investors ?? []).filter((i) => !isDemoInvestor(i.id));
      return { ...(data as object), investors };
    });
  }

  for (const path of await listPaths(paths.audit)) {
    const { data } = await readJson(path);
    if (!parseAuditEvents((data as { events?: unknown })?.events).some(isDemoEvent)) continue;
    await mutate(path, (current) => ({
      events: parseAuditEvents((current as { events?: unknown })?.events).filter((e) => !isDemoEvent(e)),
    }));
  }
  console.log(`Removed demo data from "${env}" (${demoFiles.length} inquiry files).`);
}

// ---------- add ----------

async function addDemo(): Promise<void> {
  const rates = await readRates();
  const events: AuditEvent[] = [];
  const investors: Investor[] = [];
  const credentials = {
    passwordHash: null,
    passwordVersion: 0,
    mustChangePassword: false,
    setupTokenHash: null,
    setupExpiresAt: null,
  };

  function event(when: Date, actor: AuditActor, category: AuditEvent["category"], action: string, summary: string, target?: AuditEvent["target"]): AuditEvent {
    const e: AuditEvent = { id: demoId(), at: when.toISOString(), actor, category, action, summary, ...(target ? { target } : {}) };
    events.push(e);
    return e;
  }

  for (const demo of INQUIRIES) {
    const created = at(demo.daysAgo, demo.hour, 7 * demo.n);
    const id = makeInquiryId(created, `${DEMO_HEX}${String(demo.n).padStart(2, "0")}`);
    const ref = inquiryReference(id);
    const quote = {
      principal: demo.principal,
      lockInYears: demo.lockInYears,
      frequency: demo.frequency,
      payoutType: demo.payoutType,
      investmentDate: isoDate(plusDays(created, demo.investInDays)),
    };
    const { selected } = buildScenarios(quote, rates);
    const target = { type: "inquiry" as const, id, label: `${ref} (${demo.name})` };
    const own: AuditEvent[] = [];

    own.push(
      event(created, { kind: "visitor", name: demo.name }, "inquiry", "inquiry.received",
        `Inquiry ${ref} received from ${demo.name} (${demo.email}) for ${formatDollars(demo.principal)}`, target),
    );
    if (demo.contactedDaysAgo !== undefined) {
      own.push(event(at(demo.contactedDaysAgo, demo.hour + 1, 30), admins.suresh, "inquiry", "inquiry.status",
        `Marked inquiry ${ref} (${demo.name}) as contacted`, target));
    }

    const inquiry: StoredInquiry = {
      id,
      createdAt: created.toISOString(),
      status: demo.status,
      name: demo.name,
      email: demo.email,
      phone: demo.phone,
      message: demo.message,
      source: demo.source ?? DEFAULT_LEAD_SOURCE,
      plan: {
        ...quote,
        startDate: selected.startDate,
        annualRatePercent: selected.inputs.annualRatePercent,
        totalInterestCents: selected.totals.interestCents,
        totalPaidCents: selected.totals.payoutCents,
      },
    };

    if (demo.status === "deleted") {
      const when = at(demo.doneDaysAgo!, 12);
      inquiry.deletedAt = when.toISOString();
      inquiry.statusBeforeDelete = demo.statusBeforeDelete;
      own.push(event(when, admins.ashwin, "inquiry", "inquiry.deleted", `Deleted inquiry ${ref} (${demo.name})`, target));
    }

    if (demo.status === "converted" && demo.investor) {
      const when = at(demo.doneDaysAgo!, 16);
      const investorId = `inv_demo${String(demo.n).padStart(8, "0")}`;
      inquiry.investorId = investorId;
      inquiry.convertedAt = when.toISOString();
      investors.push({
        id: investorId,
        name: demo.name,
        username: demo.investor.username,
        email: demo.email,
        phone: demo.phone,
        active: true,
        createdAt: when.toISOString(),
        sourceInquiryId: id,
        investments: [{ id: `ivt_demo${demo.n}`, createdAt: when.toISOString(), ...quote, annualRatePercent: rates[demo.frequency] }],
        ...credentials,
      });
      event(when, admins.ashwin, "investor", "investor.created",
        `Converted inquiry ${ref} into investor ${demo.name} (${demo.investor.username}), ${formatDollars(demo.principal)}`,
        { type: "investor", id: investorId, label: `${demo.name} (${demo.investor.username})` });
      own.push(event(when, admins.ashwin, "inquiry", "inquiry.converted",
        `Marked inquiry ${ref} (${demo.name}) as converted to an investor`, target));
    }

    const notes: InquiryNote[] = demo.notes.map((n, i) => ({
      id: `demo${demo.n}${i}`,
      at: at(n.daysAgo, n.hour, 5 + i).toISOString(),
      kind: n.kind,
      author: admins[n.by],
      text: n.text,
    }));
    const last = [...notes].sort((a, b) => (a.at < b.at ? 1 : -1))[0];
    if (last) {
      inquiry.notes = {
        count: notes.length,
        last: { at: last.at, kind: last.kind, by: last.author.name, text: last.text.slice(0, NOTE_PREVIEW_LENGTH) },
      };
    }

    const log: InquiryLog = { inquiryId: id, events: own, notes, backfilled: true };
    await put(`${paths.inquiries}${id}.json`, JSON.stringify(inquiry, null, 2), {
      access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
    });
    await put(`${paths.logs}${id}.json`, JSON.stringify(log), {
      access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
    });
    console.log(`  Inquiry ${ref}  ${demo.status.padEnd(9)} ${demo.name}`);
  }

  const direct = DIRECT_INVESTOR;
  const directCreated = at(direct.daysAgo, 11);
  investors.push({
    id: "inv_demo00000010",
    name: direct.name,
    username: direct.username,
    email: direct.email,
    phone: direct.phone,
    active: true,
    createdAt: directCreated.toISOString(),
    sourceInquiryId: null,
    investments: direct.investments.map((inv, i) => {
      const when = at(inv.daysAgo, 11, i);
      return {
        id: `ivt_demo10${i}`,
        createdAt: when.toISOString(),
        principal: inv.principal,
        investmentDate: isoDate(when),
        lockInYears: inv.lockInYears,
        frequency: inv.frequency,
        payoutType: inv.payoutType,
        annualRatePercent: rates[inv.frequency],
      };
    }),
    ...credentials,
  });
  event(directCreated, admins.ashwin, "investor", "investor.created",
    `Added investor ${direct.name} (${direct.username}), ${formatDollars(direct.investments[0].principal)}`,
    { type: "investor", id: "inv_demo00000010", label: `${direct.name} (${direct.username})` });

  await mutate(paths.investors, (data) => {
    const current = ((data as { investors?: Investor[] })?.investors ?? []).filter((i) => !isDemoInvestor(i.id));
    const taken = new Set(current.map((i) => i.username));
    const fresh = investors.filter((i) => !taken.has(i.username));
    for (const skipped of investors.filter((i) => taken.has(i.username))) {
      console.warn(`  Skipped investor ${skipped.username}: that username is already used.`);
    }
    return { ...(data as object | null), investors: [...current, ...fresh] };
  });
  for (const i of investors) console.log(`  Investor ${i.username.padEnd(9)} ${i.name}`);

  const byMonth = new Map<string, AuditEvent[]>();
  for (const e of events) byMonth.set(auditMonth(e.at), [...(byMonth.get(auditMonth(e.at)) ?? []), e]);
  for (const [month, monthEvents] of byMonth) {
    await mutate(`${paths.audit}${month}.json`, (data) => ({
      events: [...parseAuditEvents((data as { events?: unknown })?.events).filter((e) => !isDemoEvent(e)), ...monthEvents],
    }));
  }
  console.log(`Added demo data to "${env}": ${INQUIRIES.length} inquiries, ${investors.length} investors, ${events.length} audit events.`);
  console.log(`Admins named in it: ${Object.values(admins).map((a) => `${a.name} (${ROLE_LABELS[a.role!]})`).join(", ")}.`);
}

async function main(): Promise<void> {
  await removeDemo();
  if (!remove) await addDemo();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import "server-only";
import { randomBytes } from "node:crypto";
import { BlobError, BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { writableEtag } from "./blob-etag";
import {
  normalizeEmail,
  SEED_ADMINS,
  SETUP_LINK_HOURS,
  validateEmailAddress,
  type AdminRole,
  type AdminUser,
  type Credentials,
  type Investment,
  type Investor,
  type PayoutPayment,
} from "../accounts";
import type { PayoutFrequency, PayoutType } from "../payout";
import {
  CHANGE_HISTORY_KEEP,
  type ChangeRequest,
  type ChangeRequestKind,
  type ChangeRequestStatus,
  type StoredBankDetails,
} from "../profile-requests";
import { hashSetupToken, newSetupToken } from "./passwords";

/**
 * Admin users and investors are stored as two private JSON files in Vercel
 * Blob. Every write checks the file's ETag, so concurrent changes never
 * overwrite each other (the write is retried on a conflict). Production,
 * preview and local development use separate folders.
 *
 * Public API (all server-only):
 *   Admin users: listAdminUsers, getAdminUser, findAdminByUsername, findAdminByEmail,
 *     createAdminUser, updateAdminUser, setAdminPassword, issueAdminSetupToken
 *   Investors: listInvestors, getInvestor, findInvestorByUsername, findInvestorsByEmail,
 *     createInvestor, updateInvestor, setInvestorPassword, issueInvestorSetupToken
 *   Investments: addInvestment, setPayoutPayment, removePayoutPayment
 *   Change requests: addChangeRequest, withdrawChangeRequest, decideChangeRequest
 *   Setup links: findAccountBySetupToken
 */
const ENV = process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV || "local";
const ADMINS_PATH = `accounts/${ENV}/admin-users.json`;
const INVESTORS_PATH = `accounts/${ENV}/investors.json`;
const WRITE_ATTEMPTS = 3;

export function isAccountStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export class AccountError extends Error {}

// ---------- generic JSON document with optimistic concurrency ----------

async function readDoc<T>(path: string, parse: (data: unknown) => T): Promise<{ value: T | null; etag: string | null }> {
  if (!isAccountStorageConfigured()) return { value: null, etag: null };
  const result = await get(path, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return { value: null, etag: null };
  const text = await new Response(result.stream).text();
  return { value: parse(JSON.parse(text)), etag: writableEtag(result.blob.etag) };
}

function isConflict(error: unknown): boolean {
  return (
    error instanceof BlobPreconditionFailedError ||
    (error instanceof BlobError && /already exists/i.test(error.message))
  );
}

/** Reads the document (or `initial()` when missing), applies `change`, writes it back. */
async function mutateDoc<T, R>(
  path: string,
  parse: (data: unknown) => T,
  initial: () => T,
  change: (current: T) => { next: T; result: R },
): Promise<R> {
  if (!isAccountStorageConfigured()) throw new AccountError("Account storage is not configured.");
  for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
    const { value, etag } = await readDoc(path, parse);
    const { next, result } = change(value ?? initial());
    try {
      await put(path, JSON.stringify(next, null, 2), {
        access: "private",
        addRandomSuffix: false,
        contentType: "application/json",
        ...(etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false }),
      });
      return result;
    } catch (error) {
      if (!isConflict(error) || attempt === WRITE_ATTEMPTS) throw error;
    }
  }
  throw new AccountError("Saving failed.");
}

// ---------- parsing ----------

const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function parseCredentials(d: Record<string, unknown>): Credentials {
  return {
    passwordHash: str(d.passwordHash),
    passwordVersion: num(d.passwordVersion) ?? 0,
    mustChangePassword: d.mustChangePassword === true,
    setupTokenHash: str(d.setupTokenHash),
    setupExpiresAt: str(d.setupExpiresAt),
  };
}

/** A stored admin email address, or null when it is missing or not a valid address. */
function parseAdminEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = normalizeEmail(value);
  return email !== "" && validateEmailAddress(email) === null ? email : null;
}

function parseAdmins(data: unknown): AdminUser[] {
  const list = (data as { users?: unknown })?.users;
  if (!Array.isArray(list)) throw new Error("Invalid admin users file.");
  return list.flatMap((raw) => {
    const d = (raw ?? {}) as Record<string, unknown>;
    const id = str(d.id);
    const name = str(d.name);
    const username = str(d.username);
    const role = d.role === "master" || d.role === "sales" ? (d.role as AdminRole) : null;
    if (!id || !name || !username || !role) return [];
    return [
      {
        id,
        name,
        username,
        role,
        active: d.active !== false,
        createdAt: str(d.createdAt) ?? new Date(0).toISOString(),
        email: parseAdminEmail(d.email),
        inquiryAlerts: d.inquiryAlerts !== false,
        ...parseCredentials(d),
      },
    ];
  });
}

const FREQUENCIES: PayoutFrequency[] = ["quarterly", "half-yearly", "yearly"];
const TYPES: PayoutType[] = ["interest-only", "interest-and-principal"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Keeps the well-formed payments, at most one per payout number. */
function parsePayments(list: unknown): PayoutPayment[] {
  if (!Array.isArray(list)) return [];
  const payments: PayoutPayment[] = [];
  for (const raw of list) {
    const d = (raw ?? {}) as Record<string, unknown>;
    const payoutNumber = num(d.payoutNumber);
    const paidOn = str(d.paidOn);
    const amountCents = num(d.amountCents);
    if (payoutNumber === null || !Number.isInteger(payoutNumber) || payoutNumber < 1) continue;
    if (!paidOn || !ISO_DATE.test(paidOn) || amountCents === null || !Number.isInteger(amountCents)) continue;
    if (payments.some((p) => p.payoutNumber === payoutNumber)) continue;
    payments.push({
      payoutNumber,
      paidOn,
      amountCents,
      reference: str(d.reference) ?? "",
      recordedBy: str(d.recordedBy) ?? "",
      recordedById: str(d.recordedById) ?? "",
      recordedAt: str(d.recordedAt) ?? new Date(0).toISOString(),
    });
  }
  return payments.sort((a, b) => a.payoutNumber - b.payoutNumber);
}

function parseInvestment(raw: unknown): Investment | null {
  const d = (raw ?? {}) as Record<string, unknown>;
  const frequency = str(d.frequency) as PayoutFrequency | null;
  const payoutType = str(d.payoutType) as PayoutType | null;
  const investment = {
    id: str(d.id),
    principal: num(d.principal),
    investmentDate: str(d.investmentDate),
    lockInYears: num(d.lockInYears),
    annualRatePercent: num(d.annualRatePercent),
    createdAt: str(d.createdAt),
  };
  if (!frequency || !FREQUENCIES.includes(frequency) || !payoutType || !TYPES.includes(payoutType)) return null;
  if (Object.values(investment).some((v) => v === null)) return null;
  return {
    ...(investment as Omit<Investment, "frequency" | "payoutType" | "renewedFromId" | "payments">),
    frequency,
    payoutType,
    renewedFromId: str(d.renewedFromId),
    payments: parsePayments(d.payments),
  };
}

function parseBankDetails(raw: unknown): StoredBankDetails | null {
  const d = (raw ?? {}) as Record<string, unknown>;
  const encrypted = str(d.encrypted);
  const accountLast4 = str(d.accountLast4);
  if (!encrypted || accountLast4 === null) return null;
  return { encrypted, accountLast4, updatedAt: str(d.updatedAt) ?? new Date(0).toISOString() };
}

const REQUEST_KINDS: ChangeRequestKind[] = ["contact", "bank"];
const REQUEST_STATUSES: ChangeRequestStatus[] = ["pending", "approved", "rejected", "withdrawn"];

/** Keeps the well-formed change requests. */
function parseChangeRequests(list: unknown): ChangeRequest[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((raw): ChangeRequest[] => {
    const d = (raw ?? {}) as Record<string, unknown>;
    const id = str(d.id);
    const kind = str(d.kind) as ChangeRequestKind | null;
    const status = str(d.status) as ChangeRequestStatus | null;
    const requestedAt = str(d.requestedAt);
    if (!id || !kind || !REQUEST_KINDS.includes(kind) || !status || !REQUEST_STATUSES.includes(status) || !requestedAt) {
      return [];
    }
    const c = (d.contact ?? null) as Record<string, unknown> | null;
    const b = (d.bank ?? null) as Record<string, unknown> | null;
    const contact = kind === "contact" && c ? { email: str(c.email) ?? "", phone: str(c.phone) ?? "" } : null;
    const bank = kind === "bank" && b ? { encrypted: str(b.encrypted), accountLast4: str(b.accountLast4) ?? "" } : null;
    if ((kind === "contact" && !contact) || (kind === "bank" && !bank)) return [];
    return [
      {
        id,
        kind,
        status,
        requestedAt,
        contact,
        bank,
        decidedAt: str(d.decidedAt),
        decidedBy: str(d.decidedBy),
        decidedById: str(d.decidedById),
        reason: str(d.reason) ?? "",
      },
    ];
  });
}

function parseInvestors(data: unknown): Investor[] {
  const list = (data as { investors?: unknown })?.investors;
  if (!Array.isArray(list)) throw new Error("Invalid investors file.");
  return list.flatMap((raw) => {
    const d = (raw ?? {}) as Record<string, unknown>;
    const id = str(d.id);
    const name = str(d.name);
    const username = str(d.username);
    if (!id || !name || !username) return [];
    const investments = Array.isArray(d.investments)
      ? d.investments.map(parseInvestment).filter((i): i is Investment => i !== null)
      : [];
    return [
      {
        id,
        name,
        username,
        email: str(d.email) ?? "",
        phone: str(d.phone) ?? "",
        active: d.active !== false,
        createdAt: str(d.createdAt) ?? new Date(0).toISOString(),
        sourceInquiryId: str(d.sourceInquiryId),
        investments,
        bankDetails: parseBankDetails(d.bankDetails),
        changeRequests: parseChangeRequests(d.changeRequests),
        ...parseCredentials(d),
      },
    ];
  });
}

// ---------- helpers ----------

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

function blankCredentials(): Credentials {
  return {
    passwordHash: null,
    passwordVersion: 0,
    mustChangePassword: false,
    setupTokenHash: null,
    setupExpiresAt: null,
  };
}

function seededAdmins(): AdminUser[] {
  const now = new Date().toISOString();
  return SEED_ADMINS.map((seed) => ({
    ...seed,
    active: true,
    createdAt: now,
    email: null,
    inquiryAlerts: true,
    ...blankCredentials(),
  }));
}

/** New password state: the hash, a bumped version (signs out old sessions), no setup link. */
function withPassword<T extends Credentials>(account: T, passwordHash: string, mustChangePassword: boolean): T {
  return {
    ...account,
    passwordHash,
    passwordVersion: account.passwordVersion + 1,
    mustChangePassword,
    setupTokenHash: null,
    setupExpiresAt: null,
  };
}

function withSetupToken<T extends Credentials>(account: T, nowMs: number): { account: T; token: string } {
  const token = newSetupToken();
  return {
    token,
    account: {
      ...account,
      setupTokenHash: hashSetupToken(token),
      setupExpiresAt: new Date(nowMs + SETUP_LINK_HOURS * 3600_000).toISOString(),
    },
  };
}

// ---------- admin users ----------

/** All admin users. The seed users are created (and saved) on first use. */
export async function listAdminUsers(): Promise<AdminUser[]> {
  if (!isAccountStorageConfigured()) return seededAdmins();
  const { value } = await readDoc(ADMINS_PATH, parseAdmins);
  if (value) return value;
  return mutateDoc(
    ADMINS_PATH,
    (data) => ({ users: parseAdmins(data) }),
    () => ({ users: seededAdmins() }),
    (doc) => ({ next: doc, result: doc.users }),
  );
}

export async function getAdminUser(id: string): Promise<AdminUser | null> {
  return (await listAdminUsers()).find((u) => u.id === id) ?? null;
}

export async function findAdminByUsername(username: string): Promise<AdminUser | null> {
  return (await listAdminUsers()).find((u) => u.username === username) ?? null;
}

/** The admin with this (normalized) email address. Admin email addresses are unique. */
export async function findAdminByEmail(email: string): Promise<AdminUser | null> {
  if (email === "") return null;
  return (await listAdminUsers()).find((u) => u.email === email) ?? null;
}

function mutateAdmins<R>(change: (users: AdminUser[]) => { users: AdminUser[]; result: R }): Promise<R> {
  // A missing file starts from the seed users (fixed ids), the same as listAdminUsers.
  return mutateDoc(
    ADMINS_PATH,
    (data) => ({ users: parseAdmins(data) }),
    () => ({ users: seededAdmins() }),
    (doc) => {
      const { users, result } = change(doc.users);
      return { next: { users }, result };
    },
  );
}

function updateAdmin(users: AdminUser[], id: string, update: (u: AdminUser) => AdminUser): AdminUser[] {
  if (!users.some((u) => u.id === id)) throw new AccountError("User not found.");
  return users.map((u) => (u.id === id ? update(u) : u));
}

export function createAdminUser(input: { name: string; username: string; role: AdminRole }): Promise<AdminUser> {
  return mutateAdmins((users) => {
    if (users.some((u) => u.username === input.username)) throw new AccountError("That username is already taken.");
    const user: AdminUser = {
      id: newId("adm"),
      name: input.name.trim(),
      username: input.username,
      role: input.role,
      active: true,
      createdAt: new Date().toISOString(),
      email: null,
      inquiryAlerts: true,
      ...blankCredentials(),
    };
    return { users: [...users, user], result: user };
  });
}

/**
 * Updates name, role, active state, email address or inquiry alerts. Refuses
 * to leave the system without an active Master Admin, or to give two users the
 * same email address (it is used to reset passwords).
 */
export function updateAdminUser(
  id: string,
  patch: Partial<Pick<AdminUser, "name" | "role" | "active" | "email" | "inquiryAlerts">>,
): Promise<AdminUser> {
  return mutateAdmins((users) => {
    if (patch.email && users.some((u) => u.id !== id && u.email === patch.email)) {
      throw new AccountError("Another user already has that email address.");
    }
    const next = updateAdmin(users, id, (u) => ({ ...u, ...patch, name: (patch.name ?? u.name).trim() }));
    if (!next.some((u) => u.role === "master" && u.active)) {
      throw new AccountError("There must always be at least one active Master Admin.");
    }
    return { users: next, result: next.find((u) => u.id === id)! };
  });
}

/** Sets a password. `temporary` means the person must choose a new one at their next sign-in. */
export function setAdminPassword(id: string, passwordHash: string, temporary: boolean): Promise<AdminUser> {
  return mutateAdmins((users) => {
    const next = updateAdmin(users, id, (u) => withPassword(u, passwordHash, temporary));
    return { users: next, result: next.find((u) => u.id === id)! };
  });
}

/** Creates a one-time setup link token (returned once; only its hash is stored). */
export function issueAdminSetupToken(id: string): Promise<string> {
  return mutateAdmins((users) => {
    let token = "";
    const next = updateAdmin(users, id, (u) => {
      const issued = withSetupToken(u, Date.now());
      token = issued.token;
      return issued.account;
    });
    return { users: next, result: token };
  });
}

// ---------- investors ----------

export async function listInvestors(): Promise<Investor[]> {
  const { value } = await readDoc(INVESTORS_PATH, parseInvestors);
  return value ?? [];
}

export async function getInvestor(id: string): Promise<Investor | null> {
  return (await listInvestors()).find((i) => i.id === id) ?? null;
}

export async function findInvestorByUsername(username: string): Promise<Investor | null> {
  return (await listInvestors()).find((i) => i.username === username) ?? null;
}

/** Investors with this (normalized) email address. Several investors can share one. */
export async function findInvestorsByEmail(email: string): Promise<Investor[]> {
  if (email === "") return [];
  return (await listInvestors()).filter((i) => normalizeEmail(i.email) === email);
}

function mutateInvestors<R>(change: (investors: Investor[]) => { investors: Investor[]; result: R }): Promise<R> {
  return mutateDoc(
    INVESTORS_PATH,
    (data) => ({ investors: parseInvestors(data) }),
    () => ({ investors: [] as Investor[] }),
    (doc) => {
      const { investors, result } = change(doc.investors);
      return { next: { investors }, result };
    },
  );
}

function updateInvestorIn(investors: Investor[], id: string, update: (i: Investor) => Investor): Investor[] {
  if (!investors.some((i) => i.id === id)) throw new AccountError("Investor not found.");
  return investors.map((i) => (i.id === id ? update(i) : i));
}

export interface NewInvestmentInput {
  principal: number;
  investmentDate: string;
  lockInYears: number;
  frequency: PayoutFrequency;
  payoutType: PayoutType;
  annualRatePercent: number;
}

/** Creates an investor with one investment. The investor has no password until one is set. */
export function createInvestor(input: {
  name: string;
  username: string;
  email: string;
  phone: string;
  sourceInquiryId: string | null;
  investment: NewInvestmentInput;
}): Promise<Investor> {
  return mutateInvestors((investors) => {
    if (investors.some((i) => i.username === input.username)) throw new AccountError("That username is already taken.");
    if (input.sourceInquiryId && investors.some((i) => i.sourceInquiryId === input.sourceInquiryId)) {
      throw new AccountError("This inquiry has already been converted.");
    }
    const now = new Date().toISOString();
    const investor: Investor = {
      id: newId("inv"),
      name: input.name.trim(),
      username: input.username,
      email: input.email.trim(),
      phone: input.phone.trim(),
      active: true,
      createdAt: now,
      sourceInquiryId: input.sourceInquiryId,
      investments: [{ id: newId("ivt"), createdAt: now, renewedFromId: null, payments: [], ...input.investment }],
      bankDetails: null,
      changeRequests: [],
      ...blankCredentials(),
    };
    return { investors: [...investors, investor], result: investor };
  });
}

/** Updates contact details, username or login access. */
export function updateInvestor(
  id: string,
  patch: Partial<Pick<Investor, "name" | "email" | "phone" | "username" | "active">>,
): Promise<Investor> {
  return mutateInvestors((investors) => {
    if (patch.username && investors.some((i) => i.id !== id && i.username === patch.username)) {
      throw new AccountError("That username is already taken.");
    }
    const next = updateInvestorIn(investors, id, (i) => ({ ...i, ...patch }));
    return { investors: next, result: next.find((i) => i.id === id)! };
  });
}

export function setInvestorPassword(id: string, passwordHash: string, temporary: boolean): Promise<Investor> {
  return mutateInvestors((investors) => {
    const next = updateInvestorIn(investors, id, (i) => withPassword(i, passwordHash, temporary));
    return { investors: next, result: next.find((i) => i.id === id)! };
  });
}

export function issueInvestorSetupToken(id: string): Promise<string> {
  return mutateInvestors((investors) => {
    let token = "";
    const next = updateInvestorIn(investors, id, (i) => {
      const issued = withSetupToken(i, Date.now());
      token = issued.token;
      return issued.account;
    });
    return { investors: next, result: token };
  });
}

// ---------- investments and payments ----------

function updateInvestmentIn(investor: Investor, investmentId: string, update: (i: Investment) => Investment): Investor {
  if (!investor.investments.some((i) => i.id === investmentId)) throw new AccountError("Investment not found.");
  return { ...investor, investments: investor.investments.map((i) => (i.id === investmentId ? update(i) : i)) };
}

/**
 * Adds an investment to an existing investor. For a renewal, `renewedFromId`
 * names the investment it renews; each investment can be renewed only once.
 */
export function addInvestment(
  investorId: string,
  input: NewInvestmentInput & { renewedFromId: string | null },
): Promise<{ investor: Investor; investment: Investment }> {
  return mutateInvestors((investors) => {
    let investment: Investment | null = null;
    const next = updateInvestorIn(investors, investorId, (i) => {
      if (input.renewedFromId) {
        if (!i.investments.some((x) => x.id === input.renewedFromId)) throw new AccountError("Investment not found.");
        if (i.investments.some((x) => x.renewedFromId === input.renewedFromId)) {
          throw new AccountError("This investment has already been renewed.");
        }
      }
      investment = { id: newId("ivt"), createdAt: new Date().toISOString(), payments: [], ...input };
      return { ...i, investments: [...i.investments, investment] };
    });
    return { investors: next, result: { investor: next.find((i) => i.id === investorId)!, investment: investment! } };
  });
}

/** Records (or replaces) the payment of one scheduled payout. Returns the payment it replaced, if any. */
export function setPayoutPayment(
  investorId: string,
  investmentId: string,
  payment: PayoutPayment,
): Promise<{ investor: Investor; previous: PayoutPayment | null }> {
  return mutateInvestors((investors) => {
    let previous: PayoutPayment | null = null;
    const next = updateInvestorIn(investors, investorId, (investor) =>
      updateInvestmentIn(investor, investmentId, (i) => {
        previous = i.payments.find((p) => p.payoutNumber === payment.payoutNumber) ?? null;
        const others = i.payments.filter((p) => p.payoutNumber !== payment.payoutNumber);
        return { ...i, payments: [...others, payment].sort((a, b) => a.payoutNumber - b.payoutNumber) };
      }),
    );
    return { investors: next, result: { investor: next.find((i) => i.id === investorId)!, previous } };
  });
}

/** Removes the recorded payment of one payout (marks it unpaid). Returns the removed payment, or null if there was none. */
export function removePayoutPayment(
  investorId: string,
  investmentId: string,
  payoutNumber: number,
): Promise<{ investor: Investor; removed: PayoutPayment | null }> {
  return mutateInvestors((investors) => {
    let removed: PayoutPayment | null = null;
    const next = updateInvestorIn(investors, investorId, (investor) =>
      updateInvestmentIn(investor, investmentId, (i) => {
        removed = i.payments.find((p) => p.payoutNumber === payoutNumber) ?? null;
        return { ...i, payments: i.payments.filter((p) => p.payoutNumber !== payoutNumber) };
      }),
    );
    return { investors: next, result: { investor: next.find((i) => i.id === investorId)!, removed } };
  });
}

// ---------- change requests (contact and bank details) ----------

/** Pending requests, plus the most recent decided ones. */
function trimRequests(requests: ChangeRequest[]): ChangeRequest[] {
  const decided = requests
    .filter((r) => r.status !== "pending")
    .sort((a, b) => ((a.decidedAt ?? a.requestedAt) < (b.decidedAt ?? b.requestedAt) ? 1 : -1))
    .slice(0, CHANGE_HISTORY_KEEP);
  return requests.filter((r) => r.status === "pending" || decided.includes(r));
}

/** Adds a pending request. An investor can have one pending request of each kind. */
export function addChangeRequest(
  investorId: string,
  input: Pick<ChangeRequest, "kind" | "contact" | "bank">,
): Promise<{ investor: Investor; request: ChangeRequest }> {
  return mutateInvestors((investors) => {
    let request: ChangeRequest | null = null;
    const next = updateInvestorIn(investors, investorId, (i) => {
      if (i.changeRequests.some((r) => r.kind === input.kind && r.status === "pending")) {
        throw new AccountError(
          `You already have a change to your ${input.kind === "bank" ? "bank" : "contact"} details waiting for review. Withdraw it first to send a new one.`,
        );
      }
      request = {
        id: newId("chg"),
        kind: input.kind,
        status: "pending",
        requestedAt: new Date().toISOString(),
        contact: input.contact,
        bank: input.bank,
        decidedAt: null,
        decidedBy: null,
        decidedById: null,
        reason: "",
      };
      return { ...i, changeRequests: trimRequests([...i.changeRequests, request]) };
    });
    return { investors: next, result: { investor: next.find((i) => i.id === investorId)!, request: request! } };
  });
}

function pendingRequestIn(investor: Investor, requestId: string): ChangeRequest {
  const request = investor.changeRequests.find((r) => r.id === requestId);
  if (!request) throw new AccountError("This request could not be found. Reload the page.");
  if (request.status !== "pending") throw new AccountError("This request has already been dealt with. Reload the page.");
  return request;
}

/** Closes a request; the encrypted bank details it carried are dropped. */
function closeRequest(request: ChangeRequest, patch: Partial<ChangeRequest>): ChangeRequest {
  return { ...request, ...patch, bank: request.bank ? { ...request.bank, encrypted: null } : null };
}

/** The investor withdraws one of their own pending requests. */
export function withdrawChangeRequest(
  investorId: string,
  requestId: string,
): Promise<{ investor: Investor; request: ChangeRequest }> {
  return mutateInvestors((investors) => {
    let request: ChangeRequest | null = null;
    const next = updateInvestorIn(investors, investorId, (i) => {
      const closed = closeRequest(pendingRequestIn(i, requestId), { status: "withdrawn", decidedAt: new Date().toISOString() });
      request = closed;
      return { ...i, changeRequests: trimRequests(i.changeRequests.map((r) => (r.id === requestId ? closed : r))) };
    });
    return { investors: next, result: { investor: next.find((i) => i.id === investorId)!, request: request! } };
  });
}

/**
 * Approves or rejects a pending request. Approving applies it: new contact
 * details replace the current ones; new bank details (still encrypted) become
 * the investor's bank details. Returns the investor before and after.
 */
export function decideChangeRequest(
  investorId: string,
  requestId: string,
  decision: { approve: boolean; reason: string; by: Pick<AdminUser, "id" | "name"> },
): Promise<{ before: Investor; investor: Investor; request: ChangeRequest }> {
  return mutateInvestors((investors) => {
    const before = investors.find((i) => i.id === investorId);
    let request: ChangeRequest | null = null;
    const next = updateInvestorIn(investors, investorId, (i) => {
      const pending = pendingRequestIn(i, requestId);
      const now = new Date().toISOString();
      let updated: Investor = i;
      if (decision.approve && pending.kind === "contact" && pending.contact) {
        updated = { ...i, email: pending.contact.email, phone: pending.contact.phone };
      } else if (decision.approve && pending.kind === "bank") {
        if (!pending.bank?.encrypted) throw new AccountError("The bank details in this request could not be read.");
        updated = {
          ...i,
          bankDetails: { encrypted: pending.bank.encrypted, accountLast4: pending.bank.accountLast4, updatedAt: now },
        };
      }
      const closed = closeRequest(pending, {
        status: decision.approve ? "approved" : "rejected",
        decidedAt: now,
        decidedBy: decision.by.name,
        decidedById: decision.by.id,
        reason: decision.reason,
      });
      request = closed;
      return { ...updated, changeRequests: trimRequests(i.changeRequests.map((r) => (r.id === requestId ? closed : r))) };
    });
    return {
      investors: next,
      result: { before: before!, investor: next.find((i) => i.id === investorId)!, request: request! },
    };
  });
}

// ---------- setup links ----------

export interface SetupAccount {
  kind: "admin" | "investor";
  id: string;
  name: string;
  username: string;
}

/** Finds the admin user or investor a (valid, unexpired) setup token belongs to. */
export async function findAccountBySetupToken(token: string, nowMs: number): Promise<SetupAccount | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const hash = hashSetupToken(token);
  const valid = (a: Credentials) =>
    a.setupTokenHash === hash && a.setupExpiresAt !== null && Date.parse(a.setupExpiresAt) > nowMs;
  const admin = (await listAdminUsers()).find(valid);
  if (admin) return { kind: "admin", id: admin.id, name: admin.name, username: admin.username };
  const investor = (await listInvestors()).find(valid);
  if (investor) return { kind: "investor", id: investor.id, name: investor.name, username: investor.username };
  return null;
}

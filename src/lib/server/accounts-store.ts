import "server-only";
import { randomBytes } from "node:crypto";
import { BlobError, BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { writableEtag } from "./blob-etag";
import {
  normalizeEmail,
  SEED_ADMINS,
  SETUP_LINK_HOURS,
  validateEmailAddress,
  type AccountKind,
  type AdminRole,
  type AdminUser,
  type Credentials,
  type Investment,
  type Investor,
  type PayoutPayment,
} from "../accounts";
import type { PayoutFrequency, PayoutType } from "../payout";
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
 *   Setup links: findAccountBySetupToken
 *   Two-step sign-in (admins and investors): setTwoStepPending, enableTwoStep,
 *     disableTwoStep, markTotpStepUsed, spendRecoveryCode
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

/** Stored recovery code hashes: SHA-256 in base64url (43 characters). Anything else is dropped. */
function parseRecoveryHashes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v));
}

function parseCredentials(d: Record<string, unknown>): Credentials {
  const totpSecret = str(d.totpSecret);
  const lastStep = num(d.totpLastStep);
  return {
    passwordHash: str(d.passwordHash),
    passwordVersion: num(d.passwordVersion) ?? 0,
    mustChangePassword: d.mustChangePassword === true,
    setupTokenHash: str(d.setupTokenHash),
    setupExpiresAt: str(d.setupExpiresAt),
    totpSecret,
    totpPendingSecret: str(d.totpPendingSecret),
    totpEnabledAt: totpSecret ? str(d.totpEnabledAt) : null,
    totpLastStep: lastStep !== null && Number.isSafeInteger(lastStep) && lastStep > 0 ? lastStep : 0,
    recoveryCodeHashes: totpSecret ? parseRecoveryHashes(d.recoveryCodeHashes) : [],
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
    ...twoStepOff(),
  };
}

/** Two-step sign-in switched off. The last used time step is kept, so old codes stay used. */
function twoStepOff(lastStep = 0): Pick<
  Credentials,
  "totpSecret" | "totpPendingSecret" | "totpEnabledAt" | "totpLastStep" | "recoveryCodeHashes"
> {
  return { totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: lastStep, recoveryCodeHashes: [] };
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

/**
 * New password state: the hash, a bumped version (signs out old sessions), no
 * setup link. Two-step sign-in stays as it is, so a reset never bypasses it.
 */
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

// ---------- two-step sign-in ----------

/** Applies `change` to one admin user's or investor's credentials and saves the result. */
function mutateCredentials<R>(
  kind: AccountKind,
  id: string,
  change: (account: Credentials) => { patch: Partial<Credentials>; result: R },
): Promise<R> {
  if (kind === "admin") {
    return mutateAdmins((users) => {
      let result!: R;
      const next = updateAdmin(users, id, (u) => {
        const changed = change(u);
        result = changed.result;
        return { ...u, ...changed.patch };
      });
      return { users: next, result };
    });
  }
  return mutateInvestors((investors) => {
    let result!: R;
    const next = updateInvestorIn(investors, id, (i) => {
      const changed = change(i);
      result = changed.result;
      return { ...i, ...changed.patch };
    });
    return { investors: next, result };
  });
}

/** Starts (encrypted secret) or cancels (null) a two-step setup that still needs confirming. */
export function setTwoStepPending(kind: AccountKind, id: string, encryptedSecret: string | null): Promise<void> {
  return mutateCredentials(kind, id, () => ({ patch: { totpPendingSecret: encryptedSecret }, result: undefined }));
}

/**
 * Turns two-step sign-in on with the pending secret, once the person entered a
 * code for `step`. False when the setup changed meanwhile (e.g. restarted in
 * another tab) or the step was already used.
 */
export function enableTwoStep(
  kind: AccountKind,
  id: string,
  pendingSecret: string,
  step: number,
  recoveryCodeHashes: string[],
): Promise<boolean> {
  return mutateCredentials(kind, id, (account) => {
    if (account.totpPendingSecret !== pendingSecret || step <= account.totpLastStep) return { patch: {}, result: false };
    return {
      patch: {
        totpSecret: pendingSecret,
        totpPendingSecret: null,
        totpEnabledAt: new Date().toISOString(),
        totpLastStep: step,
        recoveryCodeHashes,
      },
      result: true,
    };
  });
}

/** Turns two-step sign-in off (by the person, or a reset by a Master Admin). */
export function disableTwoStep(kind: AccountKind, id: string): Promise<void> {
  return mutateCredentials(kind, id, (account) => ({ patch: twoStepOff(account.totpLastStep), result: undefined }));
}

/**
 * Records that a code for `step` was used. False when that step (or a later
 * one) was already used: the same code never works twice, even when two
 * requests arrive at once (the write checks the file's ETag).
 */
export function markTotpStepUsed(kind: AccountKind, id: string, step: number): Promise<boolean> {
  return mutateCredentials(kind, id, (account) =>
    !account.totpSecret || step <= account.totpLastStep
      ? { patch: {}, result: false }
      : { patch: { totpLastStep: step }, result: true },
  );
}

/** Uses up a recovery code by its hash. Returns how many are left, or null when it does not match an unused code. */
export function spendRecoveryCode(kind: AccountKind, id: string, hash: string): Promise<number | null> {
  return mutateCredentials(kind, id, (account) => {
    if (!account.totpSecret || !account.recoveryCodeHashes.includes(hash)) return { patch: {}, result: null };
    const left = account.recoveryCodeHashes.filter((h) => h !== hash);
    return { patch: { recoveryCodeHashes: left }, result: left.length };
  });
}

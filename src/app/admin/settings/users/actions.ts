"use server";

import { refresh } from "next/cache";
import {
  normalizeUsername,
  ROLE_LABELS,
  validatePersonName,
  validateUsername,
  type AdminRole,
} from "@/lib/accounts";
import {
  AccountError,
  createAdminUser,
  getAdminUser,
  issueAdminSetupToken,
  setAdminPassword,
  updateAdminUser,
} from "@/lib/server/accounts-store";
import { requireAdminPermission } from "@/lib/server/auth";
import { hashPassword, validateNewPassword } from "@/lib/server/passwords";

/**
 * Admin user management (Master Admin only). Every action checks the
 * "users.manage" permission first: server actions are public endpoints.
 */

const NO_PERMISSION = "Your session has ended or you no longer have access. Sign in again.";

export interface ActionMessage {
  status: "idle" | "ok" | "error";
  message?: string;
}

function isAdminId(value: unknown): value is string {
  return typeof value === "string" && /^adm_[A-Za-z0-9_-]{1,64}$/.test(value);
}

function isRole(value: unknown): value is AdminRole {
  return value === "master" || value === "sales";
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** AccountError messages are written for people; anything else is logged and hidden. */
function failure(error: unknown, fallback: string): { status: "error"; message: string } {
  if (error instanceof AccountError) return { status: "error", message: error.message };
  console.error(fallback, error);
  return { status: "error", message: `${fallback} Please try again.` };
}

// ---------- add user ----------

export interface AddUserState extends ActionMessage {
  fieldErrors?: Partial<Record<"name" | "username" | "role", string>>;
  /** What the Master Admin typed, so the form keeps it after an error. */
  values?: { name: string; username: string; role: string };
}

export async function addUserAction(_prev: AddUserState, formData: FormData): Promise<AddUserState> {
  if (!(await requireAdminPermission("users.manage"))) return { status: "error", message: NO_PERMISSION };

  const values = { name: text(formData, "name"), username: text(formData, "username"), role: text(formData, "role") };
  const name = values.name.trim();
  const username = normalizeUsername(values.username);
  const fieldErrors: AddUserState["fieldErrors"] = {};
  const nameError = validatePersonName(name);
  if (nameError) fieldErrors.name = nameError;
  const usernameError = validateUsername(username);
  if (usernameError) fieldErrors.username = usernameError;
  if (!isRole(values.role)) fieldErrors.role = "Choose a role.";
  if (Object.keys(fieldErrors).length > 0 || !isRole(values.role)) {
    return { status: "error", message: "Fix the highlighted fields.", fieldErrors, values };
  }

  try {
    const user = await createAdminUser({ name, username, role: values.role });
    refresh();
    return {
      status: "ok",
      message: `${user.name} (${user.username}) was added as a ${ROLE_LABELS[user.role]}. Create a setup link or set a temporary password so they can sign in.`,
    };
  } catch (error) {
    const result = failure(error, "The user could not be added.");
    return /taken/i.test(result.message)
      ? { ...result, fieldErrors: { username: result.message }, message: "Fix the highlighted fields.", values }
      : { ...result, values };
  }
}

// ---------- role and access ----------

export async function changeRoleAction(_prev: ActionMessage, formData: FormData): Promise<ActionMessage> {
  const admin = await requireAdminPermission("users.manage");
  if (!admin) return { status: "error", message: NO_PERMISSION };

  const id = formData.get("id");
  const role = formData.get("role");
  if (!isAdminId(id) || !isRole(role)) return { status: "error", message: "Choose a role." };
  if (id === admin.id && role !== "master") {
    return { status: "error", message: "You cannot remove your own Master Admin role. Ask another Master Admin." };
  }

  try {
    const current = await getAdminUser(id);
    if (!current) return { status: "error", message: "User not found." };
    if (current.role === role) return { status: "ok", message: `Already a ${ROLE_LABELS[role]}.` };
    const user = await updateAdminUser(id, { role });
    refresh();
    return { status: "ok", message: `${user.name} is now a ${ROLE_LABELS[user.role]}.` };
  } catch (error) {
    return failure(error, "The role could not be changed.");
  }
}

export async function setActiveAction(_prev: ActionMessage, formData: FormData): Promise<ActionMessage> {
  const admin = await requireAdminPermission("users.manage");
  if (!admin) return { status: "error", message: NO_PERMISSION };

  const id = formData.get("id");
  const active = formData.get("active");
  if (!isAdminId(id) || (active !== "true" && active !== "false")) {
    return { status: "error", message: "Something went wrong. Reload the page and try again." };
  }
  if (id === admin.id && active === "false") {
    return { status: "error", message: "You cannot disable your own account. Ask another Master Admin." };
  }

  try {
    const user = await updateAdminUser(id, { active: active === "true" });
    refresh();
    return {
      status: "ok",
      message: user.active ? `${user.name} can sign in again.` : `${user.name} is disabled and has been signed out.`,
    };
  } catch (error) {
    return failure(error, "The user could not be updated.");
  }
}

// ---------- passwords and setup links ----------

export interface TemporaryPasswordState extends ActionMessage {
  fieldErrors?: Partial<Record<"password" | "confirm", string>>;
}

export async function setTemporaryPasswordAction(
  _prev: TemporaryPasswordState,
  formData: FormData,
): Promise<TemporaryPasswordState> {
  const admin = await requireAdminPermission("users.manage");
  if (!admin) return { status: "error", message: NO_PERMISSION };

  const id = formData.get("id");
  if (!isAdminId(id)) return { status: "error", message: "Something went wrong. Reload the page and try again." };
  if (id === admin.id) {
    return { status: "error", message: "To change your own password, use My account." };
  }

  const password = text(formData, "password");
  const confirm = text(formData, "confirm");
  const passwordError = validateNewPassword(password, confirm);
  if (passwordError) {
    // A mismatch belongs to the confirmation field; length problems to the password itself.
    const field = validateNewPassword(password, password) === null ? "confirm" : "password";
    return { status: "error", message: passwordError, fieldErrors: { [field]: passwordError } };
  }

  try {
    const user = await setAdminPassword(id, await hashPassword(password), true);
    refresh();
    return {
      status: "ok",
      message: `Temporary password set for ${user.name}. They are signed out and must choose a new password at their next sign-in. Share it with them privately.`,
    };
  } catch (error) {
    return failure(error, "The temporary password could not be set.");
  }
}

export interface SetupLinkState extends ActionMessage {
  /** The one-time token, returned once. The browser builds the full link from it. */
  token?: string;
  expiresAt?: string;
  userName?: string;
}

export async function createSetupLinkAction(_prev: SetupLinkState, formData: FormData): Promise<SetupLinkState> {
  const admin = await requireAdminPermission("users.manage");
  if (!admin) return { status: "error", message: NO_PERMISSION };

  const id = formData.get("id");
  if (!isAdminId(id)) return { status: "error", message: "Something went wrong. Reload the page and try again." };
  if (id === admin.id) {
    return { status: "error", message: "To change your own password, use My account." };
  }

  try {
    const token = await issueAdminSetupToken(id);
    const user = await getAdminUser(id);
    refresh();
    return {
      status: "ok",
      token,
      expiresAt: user?.setupExpiresAt ?? undefined,
      userName: user?.name,
    };
  } catch (error) {
    return failure(error, "The setup link could not be created.");
  }
}

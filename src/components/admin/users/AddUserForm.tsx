"use client";

import { useActionState, useId } from "react";
import { addUserAction, type AddUserState } from "@/app/admin/settings/users/actions";
import { ROLE_LABELS, type AdminRole } from "@/lib/accounts";
import { inputClass, labelClass, primaryButton } from "./ui";

const ROLE_OPTIONS: { role: AdminRole; description: string }[] = [
  { role: "sales", description: "Views inquiries and marks them contacted." },
  { role: "master", description: "Everything: inquiries, investors, interest rates and users." },
];

export function AddUserForm({ storageConfigured }: { storageConfigured: boolean }) {
  const [state, formAction, pending] = useActionState<AddUserState, FormData>(addUserAction, { status: "idle" });
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const nameId = `${baseId}-name`;
  const usernameId = `${baseId}-username`;
  const usernameHelpId = `${baseId}-username-help`;
  const roleErrorId = `${baseId}-role-error`;
  const errors = state.fieldErrors ?? {};
  const selectedRole = state.values?.role === "master" ? "master" : "sales";

  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <h2 id={headingId} className="text-base font-semibold text-slate-900">
        Add a user
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        New users have no password. After adding them, create a setup link or set a temporary password.
      </p>

      <form action={formAction} className="mt-5 space-y-5" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={nameId} className={labelClass}>
              Name
            </label>
            <input
              id={nameId}
              name="name"
              type="text"
              autoComplete="off"
              required
              maxLength={100}
              defaultValue={state.values?.name ?? ""}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${nameId}-error` : undefined}
              className={inputClass(Boolean(errors.name))}
            />
            {errors.name && (
              <p id={`${nameId}-error`} className="mt-1.5 text-xs font-medium text-red-700">
                {errors.name}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={usernameId} className={labelClass}>
              Username
            </label>
            <input
              id={usernameId}
              name="username"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={32}
              defaultValue={state.values?.username ?? ""}
              aria-invalid={errors.username ? true : undefined}
              aria-describedby={errors.username ? `${usernameId}-error ${usernameHelpId}` : usernameHelpId}
              className={inputClass(Boolean(errors.username))}
            />
            {errors.username && (
              <p id={`${usernameId}-error`} className="mt-1.5 text-xs font-medium text-red-700">
                {errors.username}
              </p>
            )}
            <p id={usernameHelpId} className="mt-1.5 text-xs text-slate-500">
              3 to 32 lowercase letters, digits, dots, underscores or hyphens, for example jsmith.
            </p>
          </div>
        </div>

        <fieldset aria-describedby={errors.role ? roleErrorId : undefined}>
          <legend className={labelClass}>Role</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {ROLE_OPTIONS.map(({ role, description }) => {
              const id = `${baseId}-role-${role}`;
              return (
                <label
                  key={role}
                  htmlFor={id}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 has-[:checked]:border-blue-700 has-[:checked]:bg-blue-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-700"
                >
                  <input
                    id={id}
                    type="radio"
                    name="role"
                    value={role}
                    defaultChecked={role === selectedRole}
                    className="mt-0.5 h-4 w-4 accent-blue-900"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{ROLE_LABELS[role]}</span>
                    <span className="block text-xs text-slate-600">{description}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {errors.role && (
            <p id={roleErrorId} className="mt-1.5 text-xs font-medium text-red-700">
              {errors.role}
            </p>
          )}
        </fieldset>

        {!storageConfigured && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Account storage is not connected, so users cannot be added or changed.
          </p>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p
            role="status"
            aria-live="polite"
            className={`text-sm ${state.status === "error" ? "font-medium text-red-700" : "text-emerald-800"}`}
          >
            {state.message}
          </p>
          <button type="submit" disabled={pending || !storageConfigured} className={`${primaryButton} shrink-0`}>
            {pending ? "Adding…" : "Add user"}
          </button>
        </div>
      </form>
    </section>
  );
}

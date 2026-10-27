"use client";

import { useId } from "react";
import type { PublicAdmin } from "@/lib/accounts";
import { AddUserForm } from "./users/AddUserForm";
import { UserRow } from "./users/UserRow";

interface Props {
  users: PublicAdmin[];
  /** The signed-in Master Admin, who cannot demote or disable themselves. */
  currentUserId: string;
  /** Server time when the page was rendered, for setup-link expiry. */
  nowMs: number;
  minPasswordLength: number;
  storageConfigured: boolean;
}

/** Master Admin screen: list employees, add employees, change roles and access, reset passwords. */
export function UsersManager({ users, currentUserId, nowMs, minPasswordLength, storageConfigured }: Props) {
  const headingId = useId();
  const activeCount = users.filter((u) => u.active).length;

  return (
    <div className="space-y-6">
      <section aria-labelledby={headingId}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id={headingId} className="text-base font-semibold text-slate-900">
            All employees
          </h2>
          <p className="text-sm text-slate-600">
            {users.length} {users.length === 1 ? "employee" : "employees"}, {activeCount} active
          </p>
        </div>
        <ul className="space-y-3">
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              isSelf={user.id === currentUserId}
              nowMs={nowMs}
              minPasswordLength={minPasswordLength}
            />
          ))}
        </ul>
      </section>

      <AddUserForm storageConfigured={storageConfigured} />
    </div>
  );
}

import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { UsersManager } from "@/components/admin/UsersManager";
import { toPublicAdmin, type AdminUser } from "@/lib/accounts";
import { isAccountStorageConfigured, listAdminUsers } from "@/lib/server/accounts-store";
import { requireAdminPage } from "@/lib/server/auth";
import { MIN_USER_PASSWORD_LENGTH } from "@/lib/server/passwords";

export const metadata: Metadata = {
  title: "Users | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

export default function UsersSettingsPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <UsersContent />
    </Suspense>
  );
}

/** The admin users, and when they were read (setup-link expiry is shown relative to it). */
async function loadUsers(): Promise<{ users: AdminUser[]; readAtMs: number } | null> {
  try {
    const users = await listAdminUsers();
    return { users, readAtMs: Date.now() };
  } catch (error) {
    console.error("Reading admin users failed", error);
    return null;
  }
}

async function UsersContent() {
  await connection();
  const admin = await requireAdminPage("users.manage");
  const loaded = await loadUsers();

  return (
    <AdminFrame user={toPublicAdmin(admin)}>
      <AdminBreadcrumb items={[{ label: "Admin", href: "/admin/inquiries" }, { label: "Settings" }, { label: "Users" }]} />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
        <p className="mt-1 text-sm text-slate-600">
          People who can sign in to the admin area. Master Admins can do everything; Sales Admins only work with
          inquiries.
        </p>
      </div>

      {!loaded ? (
        <AdminCard>
          <p role="alert" className="text-sm font-medium text-red-700">
            The users could not be loaded. Reload the page to try again.
          </p>
        </AdminCard>
      ) : (
        <UsersManager
          users={loaded.users.map(toPublicAdmin)}
          currentUserId={admin.id}
          nowMs={loaded.readAtMs}
          minPasswordLength={MIN_USER_PASSWORD_LENGTH}
          storageConfigured={isAccountStorageConfigured()}
        />
      )}
    </AdminFrame>
  );
}

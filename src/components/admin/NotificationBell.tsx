import Link from "next/link";
import { connection } from "next/server";
import { unreadCount } from "@/lib/server/notifications-store";

/**
 * Bell in the admin header with this admin's own count of new inquiries they
 * have not opened yet. It links to the unread inquiries.
 */
export async function NotificationBell({ adminId }: { adminId: string }) {
  await connection();
  let count = 0;
  try {
    count = await unreadCount(adminId);
  } catch (error) {
    console.error("Reading the unread inquiries failed", error);
  }
  const label = count === 0 ? "No new inquiries" : `${count} unread ${count === 1 ? "inquiry" : "inquiries"}`;
  return (
    <Link
      href={count > 0 ? "/admin/inquiries?unread=1&status=all" : "/admin/inquiries"}
      aria-label={label}
      title={label}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
        />
      </svg>
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

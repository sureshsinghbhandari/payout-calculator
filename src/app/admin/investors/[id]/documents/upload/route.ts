import { connection, NextResponse, type NextRequest } from "next/server";
import { isInvestorIdLike } from "@/components/admin/investors/fields";
import { kindFromFileName } from "@/lib/documents";
import { getInvestor } from "@/lib/server/accounts-store";
import { requireAdminPermission } from "@/lib/server/auth";
import { isDocumentPathname, isDocumentStorageConfigured } from "@/lib/server/documents-store";
import { createUploadTarget } from "@/lib/server/object-store";

/**
 * Upload permission for one investor document (Master Admin). The browser
 * sends the file straight to the private Supabase Storage bucket with a
 * short-lived signed URL from here, so files up to 10 MB do not pass through
 * this server (whose request size is limited). The URL only allows one file,
 * at one exact path in this investor's folder, of the declared kind; the
 * bucket itself only accepts PDF/JPEG/PNG up to 10 MB. The file is checked
 * (magic bytes) and listed by registerDocumentAction once it is uploaded.
 *
 * POST /admin/investors/<id>/documents/upload   body: { "pathname": "<folder><32 hex>.<ext>" }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const admin = await requireAdminPermission("investors.manage");
  if (!admin) return NextResponse.json({ error: "Your session has ended. Sign in again as a Master Admin." }, { status: 401 });
  if (!isDocumentStorageConfigured()) return NextResponse.json({ error: "Document storage is not configured." }, { status: 503 });

  const { id } = await params;
  let pathname: unknown;
  try {
    pathname = ((await request.json()) as { pathname?: unknown })?.pathname;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof pathname !== "string") return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const kind = kindFromFileName(pathname);
  if (!isInvestorIdLike(id) || !kind || !isDocumentPathname(pathname, id, kind)) {
    return NextResponse.json({ error: "Invalid upload path." }, { status: 400 });
  }

  try {
    if (!(await getInvestor(id))) return NextResponse.json({ error: "Investor not found." }, { status: 400 });
    const target = await createUploadTarget(pathname);
    // The publishable key is public by design (it is the one Supabase puts in browser code).
    // It is only sent along if configured; the signed URL itself is what grants the upload.
    return NextResponse.json({ ...target, apiKey: process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || null });
  } catch (error) {
    console.error("Creating a document upload URL failed", error);
    return NextResponse.json({ error: "The upload could not be started. Please try again." }, { status: 400 });
  }
}

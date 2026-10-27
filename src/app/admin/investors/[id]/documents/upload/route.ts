import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { connection, NextResponse, type NextRequest } from "next/server";
import { isInvestorIdLike } from "@/components/admin/investors/fields";
import { DOCUMENT_KINDS, kindFromFileName, MAX_DOCUMENT_BYTES } from "@/lib/documents";
import { getInvestor } from "@/lib/server/accounts-store";
import { requireAdminPermission } from "@/lib/server/auth";
import { isDocumentPathname, isDocumentStorageConfigured } from "@/lib/server/documents-store";

/**
 * Upload permission for one investor document (Master Admin). The browser
 * sends the file straight to the private Blob store with a short-lived token
 * from here, so files up to 10 MB do not pass through this server (whose
 * request size is limited). The token only allows one file, in this
 * investor's folder, of the declared kind and size. The file is checked
 * (magic bytes) and listed by registerDocumentAction once it is uploaded.
 *
 * POST /admin/investors/<id>/documents/upload
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const admin = await requireAdminPermission("investors.manage");
  if (!admin) return NextResponse.json({ error: "Your session has ended. Sign in again as a Master Admin." }, { status: 401 });
  if (!isDocumentStorageConfigured()) return NextResponse.json({ error: "Document storage is not configured." }, { status: 503 });

  const { id } = await params;
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  // Only token requests are handled; completion callbacks are not used.
  if (body?.type !== "blob.generate-client-token") return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const kind = kindFromFileName(pathname);
        if (!isInvestorIdLike(id) || !kind || !isDocumentPathname(pathname, id, kind)) {
          throw new Error("Invalid upload path.");
        }
        if (!(await getInvestor(id))) throw new Error("Investor not found.");
        return {
          allowedContentTypes: [DOCUMENT_KINDS[kind].contentType],
          maximumSizeInBytes: MAX_DOCUMENT_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 10 * 60_000,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Creating a document upload token failed", error);
    return NextResponse.json({ error: "The upload could not be started. Please try again." }, { status: 400 });
  }
}

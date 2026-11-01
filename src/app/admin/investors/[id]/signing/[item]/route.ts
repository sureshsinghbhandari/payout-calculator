import { redirect } from "next/navigation";
import { connection, type NextRequest } from "next/server";
import { isInvestorIdLike } from "@/components/admin/investors/fields";
import { buildSigningDocument } from "@/lib/agreement-template";
import { adminActor } from "@/lib/audit";
import { findSigningItem, signingFileName } from "@/lib/signing";
import { todayEastern } from "@/lib/time";
import { getInvestor } from "@/lib/server/accounts-store";
import { renderPdf } from "@/lib/server/agreement-pdf";
import { recordAudit } from "@/lib/server/audit-store";
import { requireAdminPermission } from "@/lib/server/auth";
import { isDocumentStorageConfigured, recordPrepared } from "@/lib/server/documents-store";

/**
 * Generates a document an investor signs (step 1 of the Signing panel): the
 * Investment Agreement for one investment, or the Investor Acknowledgment and
 * Consent, as a PDF pre-filled from the investor's stored data. Nothing is
 * stored: the PDF is made fresh from the data on file at the time. The
 * download is noted as "prepared" and logged.
 *
 * GET /admin/investors/<id>/signing/<item key>
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; item: string }> }) {
  await connection();
  const admin = await requireAdminPermission("investors.manage");
  if (!admin) redirect("/admin");

  const { id, item: itemKey } = await params;
  if (!isInvestorIdLike(id)) return notFound();

  let pdf: Uint8Array;
  let fileName: string;
  try {
    const investor = await getInvestor(id);
    const item = investor ? findSigningItem(investor, itemKey) : null;
    if (!investor || !item) return notFound();
    const content = buildSigningDocument(item, investor, todayEastern());
    if (!content) return notFound();
    pdf = await renderPdf(content);
    fileName = signingFileName(item, investor.name);

    // Noting the download must not stop it: the PDF is already made.
    if (isDocumentStorageConfigured()) {
      try {
        await recordPrepared(investor.id, item.key, admin.name);
      } catch (error) {
        console.error("Recording a prepared signing document failed", error);
      }
    }
    recordAudit({
      actor: adminActor(admin),
      category: "investor",
      action: "investor.signing_document_generated",
      summary: `Generated "${item.title}" to sign for investor ${investor.name} (${investor.username})`,
      target: { type: "investor", id: investor.id, label: `${investor.name} (${investor.username})` },
    });
  } catch (error) {
    console.error("Generating a signing document failed", error);
    return new Response("The document could not be made. Please try again.", { status: 500 });
  }

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.byteLength),
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function notFound(): Response {
  return new Response("This document could not be found.", { status: 404 });
}

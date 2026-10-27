import type { MetadataRoute } from "next";
import { PORTAL_NAVY } from "@/components/investor/PortalAppIcon";

/**
 * Web app manifest: lets investors install the investor portal on their phone
 * ("Add to Home Screen" / "Install app"). It opens at /portal without the
 * browser's address bar. Next.js only allows the manifest at the app root;
 * its scope is the portal, so the public calculator is not part of the app.
 * The icons come from app/portal/icon.tsx.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/portal",
    name: "Investor Portal",
    short_name: "Investor Portal",
    description: "See your investments and payout schedule.",
    start_url: "/portal",
    scope: "/portal",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: PORTAL_NAVY,
    icons: [
      { src: "/portal/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/portal/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/portal/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

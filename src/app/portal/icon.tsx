import { ImageResponse } from "next/og";
import { PortalAppIcon } from "@/components/investor/PortalAppIcon";

/**
 * Investor portal icons (192 and 512 pixels), used by the browser tab on
 * portal pages and by the web app manifest (app/manifest.ts) when the portal
 * is added to a phone's home screen. Generated at build time.
 */
const PORTAL_ICON_SIZES = [192, 512];

export function generateImageMetadata() {
  return PORTAL_ICON_SIZES.map((size) => ({
    id: String(size),
    size: { width: size, height: size },
    contentType: "image/png",
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const size = Number(await id) || 192;
  return new ImageResponse(<PortalAppIcon size={size} />, { width: size, height: size });
}

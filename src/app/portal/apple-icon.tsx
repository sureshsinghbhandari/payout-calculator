import { ImageResponse } from "next/og";
import { PortalAppIcon } from "@/components/investor/PortalAppIcon";

/** Home-screen icon for iPhone and iPad (Add to Home Screen on the investor portal). */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<PortalAppIcon size={size.width} />, size);
}

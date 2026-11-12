import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Investment Payout Calculator",
  description:
    "Estimate the payout schedule for a fixed-term investment: choose an amount, planned investment date, term, payout term and payout type to see earnings and principal by payout date.",
};

export const viewport: Viewport = {
  themeColor: "#1e3a8a",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 text-slate-900">
        {children}
        {/* Privacy-friendly page-view counts (no cookies). Vercel only: other providers load nothing
            extra, and it does nothing until Web Analytics is turned on for the Vercel project. */}
        {process.env.VERCEL ? (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        ) : null}
      </body>
    </html>
  );
}

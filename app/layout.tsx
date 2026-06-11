import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono, Sora } from "next/font/google";
import "./globals.css";

// Self-hosted via next/font: zero CDN requests, works fully offline in the
// desktop app, no FOUC, and consistent rendering for every user.
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-body", display: "swap" });
const sora = Sora({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-sora", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-jbm", display: "swap" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  minimumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#08080a" },
    { media: "(prefers-color-scheme: light)", color: "#f8f8fa" },
  ],
};

export const metadata: Metadata = {
  title: "Brainrot Market Intelligence",
  description: "Live market intelligence for Steal a Brainrot — Roblox marketplace analytics powered by Eldorado.gg data",
  keywords: ["brainrot", "marketplace", "trading", "roblox", "steal a brainrot", "market intelligence"],
  robots: "index, follow",
  openGraph: {
    title: "Brainrot Market Intelligence",
    description: "Live market intelligence for Steal a Brainrot",
    type: "website",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Brainrot Intel",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${dmSans.variable} ${sora.variable} ${jetbrains.variable}`}>
      <head>
        <link rel="dns-prefetch" href="https://cdn.eldorado.gg" />
      </head>
      <body>{children}</body>
    </html>
  );
}

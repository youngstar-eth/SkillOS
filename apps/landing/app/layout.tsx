import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_URL ?? "https://skillbase.games";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "skillbase — skill market on Base",
  description:
    "Classic arcade games, real-money tournaments on Base. Twenty mini-apps, one shared pool, on-chain scores.",
  openGraph: {
    title: "skillbase — skill market on Base",
    description:
      "Twenty mini-apps, one shared pool. Pay 1 USDC to enter, play for 24 hours, scores signed server-side and submitted on-chain.",
    url: SITE_URL,
    siteName: "skillbase",
    images: ["/assets/2048-hero.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "skillbase — skill market on Base",
    description:
      "Twenty mini-apps, one shared pool. On-chain arcade tournaments on Base.",
    images: ["/assets/2048-hero.png"],
  },
  icons: {
    icon: "/assets/sb-monogram.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0B0D",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}

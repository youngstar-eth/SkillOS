import type { Metadata } from "next";
import { Header, Providers, ReadyMarker } from "@skillbase/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skillbase Clicker — On-chain tap duels on Base",
  description:
    "Stake 1 USDC, match a player, tap as fast as you can for 2 minutes. Most taps wins the pool.",
  openGraph: {
    title: "Clicker · Skillbase",
    description: "Precision wins. Speed earns. Earn SP.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Clicker · Skillbase",
    description: "Precision wins. Speed earns. Earn SP.",
  },
  other: {
    "fc:miniapp": "{\"version\": \"1\", \"imageUrl\": \"https://clicker.skillbase.games/opengraph-image\", \"button\": {\"title\": \"Play Clicker on Skillbase\", \"action\": {\"type\": \"launch_miniapp\", \"url\": \"https://clicker.skillbase.games/tournament/solo\"}}}",
    "fc:frame": "{\"version\": \"1\", \"imageUrl\": \"https://clicker.skillbase.games/opengraph-image\", \"button\": {\"title\": \"Play Clicker on Skillbase\", \"action\": {\"type\": \"launch_miniapp\", \"url\": \"https://clicker.skillbase.games/tournament/solo\"}}}",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased bg-bg text-neutral-100">
        <Providers>
          <ReadyMarker />
          <Header brand="Skillbase · Clicker" />
          <div className="mx-auto max-w-5xl px-4">{children}</div>
        </Providers>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Header, Providers, ReadyMarker } from "@skillbase/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skillbase — On-chain skill duels on Base",
  description:
    "Stake 1 USDC, match a player, play 2048 for 2 minutes. Higher score wins the pool.",
  other: {
    "fc:miniapp": "{\"version\": \"1\", \"imageUrl\": \"https://2048.skillbase.games/opengraph-image\", \"button\": {\"title\": \"Play 2048 on Skillbase\", \"action\": {\"type\": \"launch_miniapp\", \"url\": \"https://2048.skillbase.games/tournament/solo\"}}}",
    "fc:frame": "{\"version\": \"1\", \"imageUrl\": \"https://2048.skillbase.games/opengraph-image\", \"button\": {\"title\": \"Play 2048 on Skillbase\", \"action\": {\"type\": \"launch_miniapp\", \"url\": \"https://2048.skillbase.games/tournament/solo\"}}}",
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
          <Header brand="Skillbase" />
          <div className="mx-auto max-w-5xl px-4">{children}</div>
        </Providers>
      </body>
    </html>
  );
}

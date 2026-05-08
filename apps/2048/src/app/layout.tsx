import type { Metadata } from "next";
import { Header, Providers, ReadyMarker } from "@skillbase/ui";
import { SimplAd } from "@/components/SimplAd";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkillOS — On-chain skill duels on Base",
  description:
    "Stake 1 USDC, match a player, play 2048 for 2 minutes. Higher score wins the pool.",
  openGraph: {
    title: "2048 · SkillOS",
    description: "Merge tiles. Prove skill. Earn SP.",
  },
  twitter: {
    card: "summary_large_image",
    title: "2048 · SkillOS",
    description: "Merge tiles. Prove skill. Earn SP.",
  },
  other: {
    "fc:miniapp": "{\"version\": \"1\", \"imageUrl\": \"https://2048.skillbase.games/opengraph-image\", \"button\": {\"title\": \"Play 2048 on SkillOS\", \"action\": {\"type\": \"launch_miniapp\", \"url\": \"https://2048.skillbase.games/tournament/solo\"}}}",
    "fc:frame": "{\"version\": \"1\", \"imageUrl\": \"https://2048.skillbase.games/opengraph-image\", \"button\": {\"title\": \"Play 2048 on SkillOS\", \"action\": {\"type\": \"launch_miniapp\", \"url\": \"https://2048.skillbase.games/tournament/solo\"}}}",
    "base:app_id": "69f1e761bbed26bd8fc51c5e",
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
        <SimplAd />
        <Providers>
          <ReadyMarker />
          <Header brand="SkillOS" />
          <div className="mx-auto max-w-5xl px-4">{children}</div>
        </Providers>
      </body>
    </html>
  );
}

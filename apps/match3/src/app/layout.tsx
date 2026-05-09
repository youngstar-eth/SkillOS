import type { Metadata } from "next";
import { Header, Providers, ReadyMarker } from "@skillbase/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkillOS Match 3 — On-chain gem duels on Base",
  description:
    "Stake 1 USDC, match a player, swap gems for 2 minutes. Deepest cascades + highest score wins the pool.",
  openGraph: {
    title: "Match 3 · SkillOS",
    description: "Chain combos. Stack points. Earn SP.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Match 3 · SkillOS",
    description: "Chain combos. Stack points. Earn SP.",
  },
  other: {
    "fc:miniapp": "{\"version\": \"1\", \"imageUrl\": \"https://match3.skillbase.games/opengraph-image\", \"button\": {\"title\": \"Play Match3 on SkillOS\", \"action\": {\"type\": \"launch_miniapp\", \"url\": \"https://match3.skillbase.games/tournament/solo\"}}}",
    "fc:frame": "{\"version\": \"1\", \"imageUrl\": \"https://match3.skillbase.games/opengraph-image\", \"button\": {\"title\": \"Play Match3 on SkillOS\", \"action\": {\"type\": \"launch_miniapp\", \"url\": \"https://match3.skillbase.games/tournament/solo\"}}}",
    "base:app_id": "69f4fe27d7175bf80cb81fca",
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
          <Header brand="SkillOS · Match 3" />
          <div className="mx-auto max-w-5xl px-4">{children}</div>
        </Providers>
      </body>
    </html>
  );
}

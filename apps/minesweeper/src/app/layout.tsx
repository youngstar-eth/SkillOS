import type { Metadata } from "next";
import { Header, Providers, ReadyMarker } from "@skillbase/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skillbase Minesweeper — On-chain Minesweeper duels on Base",
  description:
    "Stake 1 USDC, match a player, clear the same 9×9 board. Most safe cells revealed in 2 minutes wins the pool.",
  openGraph: {
    title: "Minesweeper · Skillbase",
    description: "Read the board. Beat the clock. Earn SP.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Minesweeper · Skillbase",
    description: "Read the board. Beat the clock. Earn SP.",
  },
  other: {
    "fc:miniapp": "{\"version\": \"1\", \"imageUrl\": \"https://minesweeper.skillbase.games/opengraph-image\", \"button\": {\"title\": \"Play Minesweeper on Skillbase\", \"action\": {\"type\": \"launch_miniapp\", \"url\": \"https://minesweeper.skillbase.games/tournament/solo\"}}}",
    "fc:frame": "{\"version\": \"1\", \"imageUrl\": \"https://minesweeper.skillbase.games/opengraph-image\", \"button\": {\"title\": \"Play Minesweeper on Skillbase\", \"action\": {\"type\": \"launch_miniapp\", \"url\": \"https://minesweeper.skillbase.games/tournament/solo\"}}}",
    "base:app_id": "69f4de81d7175bf80cb81fb2",
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
          <Header brand="Skillbase · Minesweeper" />
          <div className="mx-auto max-w-5xl px-4">{children}</div>
        </Providers>
      </body>
    </html>
  );
}

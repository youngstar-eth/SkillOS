import type { Metadata } from "next";
import { Header, Providers, ReadyMarker } from "@skillbase/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skillbase Sudoku — On-chain Sudoku duels on Base",
  description:
    "Stake 1 USDC, match a player, race to solve the same puzzle. Most cells correct in 2 minutes wins the pool.",
  other: {
    "fc:miniapp": "{\"version\": \"1\", \"imageUrl\": \"https://sudoku.skillbase.games/opengraph-image\", \"button\": {\"title\": \"Play Sudoku on Skillbase\", \"action\": {\"type\": \"launch_miniapp\", \"url\": \"https://sudoku.skillbase.games/tournament/solo\"}}}",
    "fc:frame": "{\"version\": \"1\", \"imageUrl\": \"https://sudoku.skillbase.games/opengraph-image\", \"button\": {\"title\": \"Play Sudoku on Skillbase\", \"action\": {\"type\": \"launch_miniapp\", \"url\": \"https://sudoku.skillbase.games/tournament/solo\"}}}",
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
          <Header brand="Skillbase · Sudoku" />
          <div className="mx-auto max-w-5xl px-4">{children}</div>
        </Providers>
      </body>
    </html>
  );
}

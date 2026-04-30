import type { Metadata } from "next";
import { Header, Providers, ReadyMarker } from "@skillbase/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skillbase Wordle — On-chain word duels on Base",
  description:
    "Stake 1 USDC, match a player, guess the same 5-letter target in 6 tries. Best score wins the pool.",
  openGraph: {
    title: "Wordle · Skillbase",
    description: "Guess smarter. Score higher. Earn SP.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Wordle · Skillbase",
    description: "Guess smarter. Score higher. Earn SP.",
  },
  other: {
    "fc:miniapp": "{\"version\": \"1\", \"imageUrl\": \"https://wordle.skillbase.games/opengraph-image\", \"button\": {\"title\": \"Play Wordle on Skillbase\", \"action\": {\"type\": \"launch_miniapp\", \"url\": \"https://wordle.skillbase.games/tournament/solo\"}}}",
    "fc:frame": "{\"version\": \"1\", \"imageUrl\": \"https://wordle.skillbase.games/opengraph-image\", \"button\": {\"title\": \"Play Wordle on Skillbase\", \"action\": {\"type\": \"launch_miniapp\", \"url\": \"https://wordle.skillbase.games/tournament/solo\"}}}",
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
          <Header brand="Skillbase · Wordle" />
          <div className="mx-auto max-w-5xl px-4">{children}</div>
        </Providers>
      </body>
    </html>
  );
}

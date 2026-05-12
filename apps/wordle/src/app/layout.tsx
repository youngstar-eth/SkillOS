import type { Metadata } from "next";
import { Header, Providers, ReadyMarker } from "@skillos/ui";
import { SkillOSProvider } from "@skillos/sdk/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkillOS Wordle — On-chain word duels on Base",
  description:
    "Stake 1 USDC, match a player, guess the same 5-letter target in 6 tries. Best score wins the pool.",
  openGraph: {
    title: "Wordle · SkillOS",
    description: "Guess smarter. Score higher. Earn SP.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Wordle · SkillOS",
    description: "Guess smarter. Score higher. Earn SP.",
  },
  other: {
    "fc:miniapp": "{\"version\": \"1\", \"imageUrl\": \"https://wordle.skillos.games/opengraph-image\", \"button\": {\"title\": \"Play Wordle on SkillOS\", \"action\": {\"type\": \"launch_miniapp\", \"url\": \"https://wordle.skillos.games/tournament/solo\"}}}",
    "fc:frame": "{\"version\": \"1\", \"imageUrl\": \"https://wordle.skillos.games/opengraph-image\", \"button\": {\"title\": \"Play Wordle on SkillOS\", \"action\": {\"type\": \"launch_miniapp\", \"url\": \"https://wordle.skillos.games/tournament/solo\"}}}",
    "base:app_id": "69f4ff0a3b51d26eb105fb6c",
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
          <SkillOSProvider
            config={{
              env: "testnet",
              builderCode: "bc_l0drfg77",
              persistAuth: "localStorage",
            }}
          >
            <ReadyMarker />
            <Header brand="SkillOS · Wordle" />
            <div className="mx-auto max-w-5xl px-4">{children}</div>
          </SkillOSProvider>
        </Providers>
      </body>
    </html>
  );
}

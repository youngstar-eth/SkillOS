import type { Metadata } from "next";
import { Header, Providers, ReadyMarker } from "@skillos/ui";
import { SkillOSProvider } from "@skillos/sdk/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkillOS Sudoku — Skill tournaments on Base",
  description:
    "Skill-based tournaments with verifiable on-chain scoring on Base.",
  openGraph: {
    title: "SkillOS Sudoku — Skill tournaments on Base",
    description: "Solve faster. Think deeper. Earn SP.",
  },
  twitter: {
    card: "summary_large_image",
    site: "@SkillOS",
    creator: "@web3simpl",
    title: "SkillOS Sudoku — Skill tournaments on Base",
    description: "Solve faster. Think deeper. Earn SP.",
  },
  other: {
    "fc:miniapp": "{\"version\": \"1\", \"imageUrl\": \"https://sudoku.skillos.games/opengraph-image\", \"button\": {\"title\": \"Play Sudoku on SkillOS\", \"action\": {\"type\": \"launch_miniapp\", \"url\": \"https://sudoku.skillos.games/tournament/solo\"}}}",
    "fc:frame": "{\"version\": \"1\", \"imageUrl\": \"https://sudoku.skillos.games/opengraph-image\", \"button\": {\"title\": \"Play Sudoku on SkillOS\", \"action\": {\"type\": \"launch_miniapp\", \"url\": \"https://sudoku.skillos.games/tournament/solo\"}}}",
    "base:app_id": "69f4fe943b51d26eb105fb69",
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
              builderCode: "bc_ixx8hzql",
              persistAuth: "localStorage",
            }}
          >
            <ReadyMarker />
            <Header brand="SkillOS · Sudoku" />
            <div className="mx-auto max-w-5xl px-4">{children}</div>
          </SkillOSProvider>
        </Providers>
      </body>
    </html>
  );
}

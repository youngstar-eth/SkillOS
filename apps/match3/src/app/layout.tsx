import type { Metadata } from "next";
import Link from "next/link";
import { Providers, WalletButton } from "@skillbase/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skillbase Match 3 — On-chain gem duels on Base",
  description:
    "Stake 1 USDC, match a player, swap gems for 2 minutes. Deepest cascades + highest score wins the pool.",
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
          <header className="sticky top-0 z-40 border-b border-border-subtle bg-bg/80 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-sm font-semibold tracking-tight"
              >
                <span className="inline-block h-2 w-2 rounded-full bg-skill" />
                <span>Skillbase · Match 3</span>
              </Link>
              <WalletButton />
            </div>
          </header>
          <div className="mx-auto max-w-5xl px-4">{children}</div>
        </Providers>
      </body>
    </html>
  );
}

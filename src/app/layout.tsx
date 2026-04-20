import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skillbase Duel",
  description: "Async matchmaking 2048 duels on Base Sepolia.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

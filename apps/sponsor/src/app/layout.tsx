import type { Metadata } from "next";
import { Header, Providers } from "@skillbase/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skillbase — Sponsor a Pool",
  description:
    "Permissionlessly fund any Skillbase tournament prize pool. Connect wallet, sign one tx, receive a soulbound on-chain receipt.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Header brand="Skillbase · Sponsor" />
          {children}
        </Providers>
      </body>
    </html>
  );
}

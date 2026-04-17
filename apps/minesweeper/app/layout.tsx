import type { Metadata, Viewport } from "next";
import { Providers } from "@mas/shared/components";
import "./globals.css";

export const metadata: Metadata = {
  title: "Minesweeper on Base",
  description: "Y2K-themed Minesweeper as a Base Mini App.",
};

export const viewport: Viewport = {
  themeColor: "#008080",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-fg antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

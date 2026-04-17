import type { Metadata, Viewport } from "next";
import { Providers } from "@mas/shared/components";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stickman Hook on Base",
  description: "Stickman Hook as a Base Mini App.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
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

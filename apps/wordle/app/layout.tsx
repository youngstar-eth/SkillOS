import type { Metadata, Viewport } from "next";
import { Providers } from "@mas/shared/components";
import { createEmbedMetadata } from "@mas/shared/miniapp";
import { APP_CONFIG, getBaseUrl } from "../lib/app-config";
import "./globals.css";

export function generateMetadata(): Metadata {
  const url = getBaseUrl();
  return {
    title: `${APP_CONFIG.title} on Base`,
    description: APP_CONFIG.description,
    openGraph: {
      title: `${APP_CONFIG.title} — ${APP_CONFIG.subtitle}`,
      description: APP_CONFIG.description,
      images: [`${url}/hero.png`],
    },
    other: createEmbedMetadata({
      title: APP_CONFIG.title,
      imageUrl: `${url}/hero.png`,
      homeUrl: url,
      splashImageUrl: `${url}/splash.png`,
      splashBackgroundColor: APP_CONFIG.splashBg,
    }),
  };
}

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
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

import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@skillos/ui";
import { SkillOSProvider } from "@skillos/sdk/react";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "SkillOS — Sponsor a Pool",
  description:
    "Permissionlessly fund any SkillOS tournament prize pool. Connect wallet, sign one tx, receive a soulbound on-chain receipt.",
  applicationName: "SkillOS Sponsor",
  authors: [{ name: "Simpl3 Inc." }],
  creator: "Simpl3 Inc.",
  publisher: "Simpl3 Inc.",
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "SkillOS — Sponsor a Pool",
    description:
      "Fund any SkillOS tournament prize pool on-chain. One tx, soulbound receipt.",
    siteName: "SkillOS Sponsor",
  },
  twitter: {
    card: "summary_large_image",
    site: "@SkillOS",
    creator: "@web3simpl",
    title: "SkillOS — Sponsor a Pool",
    description:
      "Fund any SkillOS tournament prize pool on-chain. One tx, soulbound receipt.",
  },
  other: {
    "base:app_id": "69f5034cd7175bf80cb81fd0",
  },
};

export const viewport: Viewport = {
  themeColor: "#08090a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen font-sans antialiased">
        <Providers>
          <SkillOSProvider
            config={{
              env: "testnet",
              builderCode: "bc_2hg1v71w",
              persistAuth: "localStorage",
            }}
          >
            <Nav />
            {children}
            <Footer />
          </SkillOSProvider>
        </Providers>
      </body>
    </html>
  );
}

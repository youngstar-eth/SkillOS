import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import Script from "next/script";
import { Providers } from "@skillbase/ui";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
  weight: ["400"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "optional",
  weight: ["500"],
});

// Resolves theme from localStorage → prefers-color-scheme → dark fallback
// (sponsor's brand voice is gold + ink). Must remain a self-contained string
// with no template literals so older Safari versions can parse it before any
// bundler-transformed JS executes.
const FOUC_SCRIPT = `(function(){try{var k='skillbase-theme';var s=localStorage.getItem(k);var t=(s==='light'||s==='dark')?s:(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.classList.add('theme-'+t);}catch(e){document.documentElement.classList.add('theme-dark');}})();`;

export const metadata: Metadata = {
  title: "Skillbase — Sponsor a Pool",
  description:
    "Permissionlessly fund any Skillbase tournament prize pool. Connect wallet, sign one tx, receive a soulbound on-chain receipt.",
  applicationName: "Skillbase Sponsor",
  authors: [{ name: "Simpl3 Inc." }],
  creator: "Simpl3 Inc.",
  publisher: "Simpl3 Inc.",
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "Skillbase — Sponsor a Pool",
    description:
      "Fund any Skillbase tournament prize pool on-chain. One tx, soulbound receipt.",
    siteName: "Skillbase Sponsor",
  },
  other: {
    "base:app_id": "69f5034cd7175bf80cb81fd0",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable}`}
    >
      <body className="min-h-screen font-sans antialiased">
        <Script id="skillbase-theme-init" strategy="beforeInteractive">
          {FOUC_SCRIPT}
        </Script>
        <Providers>
          <Nav />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}

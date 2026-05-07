// Minimal root layout. Next.js 14 App Router requires `app/layout.tsx` to
// define <html><body> even for API-only apps; this stub satisfies that
// requirement without pulling fonts, themes, or globals.css. There is no
// rendered surface — visiting `/` returns a fallback page since no page.tsx
// exists, and that's intentional. Cron triggers hit `/api/cron/*` directly.

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

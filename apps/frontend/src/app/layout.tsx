import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

// Force dynamic rendering so process.env is read at request time, not cached.
export const dynamic = 'force-dynamic';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-visual',
  // Paint the iOS status bar / safe-area with the app background in each
  // color scheme (instead of the webmanifest's single theme_color, which
  // used to bleed a primary tint into the notch area on mobile).
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f1ee' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1a19' },
  ],
};

export const metadata: Metadata = {
  title: 'Placet',
  description: 'Chat-based agent inbox for AI-human interaction',
  manifest: '/favicons/site.webmanifest',
  // iOS standalone / add-to-home-screen mode: `default` respects the
  // `theme-color` meta (set per color scheme in `viewport` above) for the
  // status-bar background. Using `black-translucent` would make the bar
  // transparent but cause content to flow under the notch — we want a
  // solid bg that matches the app surface in both light and dark mode.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Placet',
  },
  icons: {
    icon: [
      { url: '/favicons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/favicons/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Expose runtime config to client-side code via a global.
  // IMPORTANT: NEXT_PUBLIC_* env vars are inlined at build time by the
  // Next.js compiler — even in Server Components — so they cannot carry
  // runtime values.  We read non-prefixed env vars first (true runtime),
  // then fall back to the NEXT_PUBLIC_ variants (build-time), then defaults.
  const runtimeConfig = JSON.stringify({
    wsUrl: process.env.WS_URL ?? process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001',
    appUrl: process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  });

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased bg-background`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__HP_CONFIG__=${runtimeConfig}`,
          }}
        />
      </head>
      <body
        className="fixed left-0 top-0 w-full overflow-hidden flex flex-col bg-background"
        style={{ height: 'var(--app-height, 100dvh)' }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

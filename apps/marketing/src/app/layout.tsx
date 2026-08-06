import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk, IBM_Plex_Sans_Arabic } from 'next/font/google';
import { BRAND } from '@erp/brand';
import { SmoothScroller, ScrollProgress } from '@erp/ui-market';
import { CanvasMount } from '@/components/CanvasMount';
import { IntroMount } from '@/components/IntroMount';
import { Navigation } from '@/components/Navigation';
import { SiteFooter } from '@/components/SiteFooter';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-plex-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline.en}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.message.en,
  icons: {
    icon: '/brand/kayan-logo.jpg',
    apple: '/brand/kayan-logo.jpg',
  },
  openGraph: {
    title: `${BRAND.name} — ${BRAND.tagline.en}`,
    description: BRAND.message.en,
    images: ['/brand/kayan-logo.jpg'],
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#5c2334',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${spaceGrotesk.variable} ${inter.variable} ${plexArabic.variable}`}
    >
      <body>
        {/* Keyboard users must be able to escape the cinematic sections. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-accent focus:px-5 focus:py-2 focus:text-sm focus:text-on-accent"
        >
          Skip to content
        </a>

        <IntroMount />

        <SmoothScroller>
          <ScrollProgress />
          <CanvasMount />
          <Navigation />
          <main id="main">{children}</main>
          <SiteFooter />
        </SmoothScroller>
      </body>
    </html>
  );
}

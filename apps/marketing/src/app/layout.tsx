import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk, Noto_Kufi_Arabic } from 'next/font/google';
import { BRAND } from '@erp/brand';
import { SmoothScroller, ScrollProgress } from '@erp/ui-market';
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

/**
 * Kufi for Arabic, matching the ERP and the brand.
 *
 * The CSS variable keeps its old name so no stylesheet needed touching; only
 * the face behind it changed.
 */
const kufiArabic = Noto_Kufi_Arabic({
  subsets: ['arabic'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-plex-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: `${BRAND.nameAr} | ${BRAND.name} — ${BRAND.tagline.ar}`,
    template: `%s · ${BRAND.nameAr}`,
  },
  description:
    'مصنع كيان للزي الموحد والطباعة والتطريز — يلكات، تيشيرتات، مرايل، قبعات، زي المطاعم والزي الإداري. خامات ممتازة، ستايلات عصرية، تطريز وطباعة داخل المصنع.',
  icons: {
    icon: '/brand/kayan-logo.jpg',
    apple: '/brand/kayan-logo.jpg',
  },
  openGraph: {
    title: `${BRAND.nameAr} | ${BRAND.name}`,
    description: BRAND.message.ar,
    images: ['/brand/kayan-logo.jpg'],
    locale: 'ar_EG',
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
      lang="ar"
      dir="rtl"
      className={`${spaceGrotesk.variable} ${inter.variable} ${kufiArabic.variable}`}
    >
      <body>
        {/* لمستخدمي لوحة المفاتيح: تخطّي الأقسام السينمائية. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-accent focus:px-5 focus:py-2 focus:text-sm focus:text-on-accent"
        >
          تخطّي إلى المحتوى
        </a>

        <IntroMount />

        <SmoothScroller>
          <ScrollProgress />
          {/* CanvasMount was removed in Phase 8. The homepage now sells with
              photographs of the actual product, and no page anchors a 3D
              scene any more — so the ~290 kB three.js runtime no longer
              loads for anybody. */}
          <Navigation />
          <main id="main">{children}</main>
          <SiteFooter />
        </SmoothScroller>
      </body>
    </html>
  );
}

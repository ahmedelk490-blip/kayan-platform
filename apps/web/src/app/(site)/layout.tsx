import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk, Noto_Kufi_Arabic } from 'next/font/google';
import { BRAND } from '@erp/brand';
import { SmoothScroller, ScrollProgress } from '@erp/ui-market';
import { IntroMount } from '@/components/site/IntroMount';
import { Navigation } from '@/components/site/Navigation';
import { SiteFooter } from '@/components/site/SiteFooter';
import { WhatsAppButton } from '@/components/site/WhatsAppButton';
import { SITE_URL, whatsappHref } from '@/site';
import { siteWhatsApp } from '@/lib/catalog';
import './site.css';

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
  // Turns every relative path — the OG image, the canonical link — into the
  // absolute URL social platforms and search engines require.
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: '/' },
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

/**
 * كل صفحة عامة تُبنى عند الطلب لا عند النشر.
 *
 * هذا التخطيط يقرأ رقم الواتساب من قاعدة البيانات، ويلفّ كل صفحات الموقع.
 * لو بقيت صفحة واحدة ثابتة، طُبع فيها الرقم لحظة البناء وبقي فيها بعد أن
 * يغيّره المدير — رقم قديم على صفحة حيّة، وهو أسوأ من غياب الزر.
 *
 * وله أثر ثانٍ: البناء لم يعد يحتاج قاعدة بيانات، فلا يفشل النشر لأن
 * الخادم لم يستطع الاتصال بها وهو يولّد صفحة «من نحن».
 */
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  themeColor: '#5c2334',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const whatsapp = await siteWhatsApp();

  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${spaceGrotesk.variable} ${inter.variable} ${kufiArabic.variable}`}
    >
      <head>
        {/*
          Applies the stored theme BEFORE the first paint.

          Doing this in an effect would render one frame of the default theme
          and then correct it — the white flash that gives away every
          bolted-on dark mode. It has to be a blocking inline script in the
          head; there is no React-shaped way to run code earlier than this.

          Falls back to the operating system preference, then to light.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
var stored=localStorage.getItem('kayan-theme');
var system=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
document.documentElement.setAttribute('data-theme', stored || system);
}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`,
          }}
        />
      </head>
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
          {/* يُحسب على الخادم فيصل للعميل رابطاً جاهزاً أو لا شيء —
              ولا يصل الرقم إلى الحزمة حين لا يكون مضبوطاً. */}
          <WhatsAppButton href={whatsappHref(whatsapp)} />
        </SmoothScroller>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import { BRAND } from '@erp/brand';
import './globals.css';

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-plex-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: `نظام ${BRAND.nameAr}`,
    template: `%s · نظام ${BRAND.nameAr}`,
  },
  description: 'النظام الداخلي لمصنع كيان',
  icons: { icon: '/brand/kayan-logo.jpg' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#5c2334',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={plexArabic.variable}>
      <body>{children}</body>
    </html>
  );
}

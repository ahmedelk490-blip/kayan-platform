import type { Metadata, Viewport } from 'next';
import { Noto_Kufi_Arabic } from 'next/font/google';
import { BRAND } from '@erp/brand';
import './erp.css';

/**
 * Noto Kufi Arabic — geometric Kufi with a genuine weight range, drawn for
 * screen legibility rather than display. Decorative Kufi faces are unusable
 * at table density, which is most of this application.
 */
const notoKufi = Noto_Kufi_Arabic({
  subsets: ['arabic'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-noto-kufi',
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
    <html lang="ar" dir="rtl" className={notoKufi.variable}>
      <body>{children}</body>
    </html>
  );
}

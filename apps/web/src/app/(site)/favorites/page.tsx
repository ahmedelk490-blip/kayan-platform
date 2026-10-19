import type { Metadata } from 'next';
import { PageHero } from '@/components/site/PageHero';
import { FavoritesList } from '@/components/site/FavoritesList';

export const metadata: Metadata = {
  title: 'المفضلة',
  description: 'المنتجات التي حفظتها لترجع إليها.',
  alternates: { canonical: '/favorites' },
  robots: { index: false },
};

export default function FavoritesPage() {
  return (
    <>
      <PageHero eyebrow="المفضلة" title="منتجاتك المفضلة" lead="المنتجات التي حفظتها بالقلب — محفوظة على هذا الجهاز." />
      <section className="mx-auto max-w-[1280px] px-4 pb-24 sm:px-6">
        <FavoritesList />
      </section>
    </>
  );
}

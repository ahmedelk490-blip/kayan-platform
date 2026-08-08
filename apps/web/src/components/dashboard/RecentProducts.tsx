'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'motion/react';

export interface RecentProduct {
  id: string;
  sku: string;
  nameAr: string;
  categoryAr: string;
  imagePath: string | null;
  imageCount: number;
}

/**
 * أحدث المنتجات — بصور حقيقية مستوردة من درايف العميل.
 *
 * Staggered entrance, then a still image with a hover zoom. The image scales
 * inside a fixed frame rather than the card growing, so neighbouring cards
 * never shift — layout movement on hover is the thing that makes dense grids
 * feel unstable.
 */
export function RecentProducts({ products }: { products: RecentProduct[] }) {
  if (products.length === 0) {
    return <p className="text-sm text-txt-3">لا توجد منتجات بعد.</p>;
  }

  return (
    <ul className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {products.map((product, index) => (
        <motion.li
          key={product.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + index * 0.07, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <Link
            href="/products"
            className="erp-card erp-card-hover group block overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {/* 4:5 rather than 3:4 — garment shots are portrait, but a
                dashboard cannot afford full-height product cards. */}
            <div className="relative aspect-[4/5] overflow-hidden bg-card-2">
              {product.imagePath ? (
                <Image
                  src={product.imagePath}
                  alt={product.nameAr}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 25vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-txt-4">
                  لا توجد صورة
                </div>
              )}
            </div>

            <div className="p-3.5">
              <p className="truncate text-sm font-medium text-txt">{product.nameAr}</p>
              <p className="mt-1 truncate text-[0.7rem] text-txt-3">{product.categoryAr}</p>
              <div className="mt-2.5 flex items-center justify-between">
                <span dir="ltr" className="tnum text-[0.68rem] text-txt-4">
                  {product.sku}
                </span>
                <span className="text-[0.68rem] text-txt-4">
                  {product.imageCount} صورة
                </span>
              </div>
            </div>
          </Link>
        </motion.li>
      ))}
    </ul>
  );
}

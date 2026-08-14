import type { MetadataRoute } from 'next';
import { SITE_URL, INDEXABLE_ROUTES } from '@/site';

/**
 * خريطة الموقع.
 *
 * Built from the same route list the canonical links use, so a page can
 * never be canonicalised to a URL the sitemap omits.
 *
 * `lastModified` is the build time rather than an invented date: it is the
 * only moment this deployment can honestly claim the content was current.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return INDEXABLE_ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}

import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/site';

/**
 * robots.txt
 *
 * `/login` and `/api/` are disallowed. Neither has any search value, and the
 * lead intake endpoint is the only unauthenticated write path in the whole
 * system — there is nothing to gain from advertising it to crawlers.
 *
 * This is not a security control. It keeps well-behaved crawlers out; the
 * rate limit inside the route is what actually protects it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/login', '/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

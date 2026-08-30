/**
 * List-view query parsing.
 *
 * Search, sort and paging live in the URL rather than in client state: the
 * server does the filtering, a filtered list is linkable and refresh-safe,
 * and the browser Back button behaves the way an operator expects.
 */

export interface ListQuery {
  q: string;
  sort: string;
  dir: 'asc' | 'desc';
  page: number;
  perPage: number;
}

export type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export function parseListQuery(
  params: SearchParams,
  options: { defaultSort: string; allowedSorts: readonly string[]; perPage?: number; defaultDir?: 'asc' | 'desc' },
): ListQuery {
  const sortRaw = first(params.sort);
  const sort = options.allowedSorts.includes(sortRaw) ? sortRaw : options.defaultSort;
  // اتجاه افتراضي قابل للضبط لكل قائمة — الفواتير مثلاً الأحدث أولاً (تنازلي).
  const dirRaw = first(params.dir);
  const dir = dirRaw === 'desc' ? 'desc' : dirRaw === 'asc' ? 'asc' : (options.defaultDir ?? 'asc');
  const page = Math.max(1, Number.parseInt(first(params.page) || '1', 10) || 1);

  return {
    q: first(params.q).trim().slice(0, 100),
    sort,
    dir,
    page,
    perPage: options.perPage ?? 25,
  };
}

export function skipTake(query: ListQuery) {
  return { skip: (query.page - 1) * query.perPage, take: query.perPage };
}

/** Build a URL preserving the current query, overriding the given keys. */
export function buildHref(
  basePath: string,
  current: ListQuery,
  overrides: Partial<Record<'q' | 'sort' | 'dir' | 'page', string | number>>,
): string {
  const params = new URLSearchParams();
  const merged = {
    q: overrides.q !== undefined ? String(overrides.q) : current.q,
    sort: overrides.sort !== undefined ? String(overrides.sort) : current.sort,
    dir: overrides.dir !== undefined ? String(overrides.dir) : current.dir,
    page: overrides.page !== undefined ? String(overrides.page) : String(current.page),
  };

  if (merged.q) params.set('q', merged.q);
  if (merged.sort) params.set('sort', merged.sort);
  if (merged.dir !== 'asc') params.set('dir', merged.dir);
  if (merged.page !== '1') params.set('page', merged.page);

  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function totalPages(count: number, perPage: number): number {
  return Math.max(1, Math.ceil(count / perPage));
}

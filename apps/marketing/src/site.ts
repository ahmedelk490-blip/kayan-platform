/**
 * Single source of truth for site navigation and footer structure.
 *
 * Kept as data rather than JSX so the header, the mobile menu, and the footer
 * sitemap cannot drift apart — a classic corporate-site defect.
 */

export const NAV_LINKS = [
  { href: '/platform', label: 'Platform' },
  { href: '/industries', label: 'Industries' },
  { href: '/company', label: 'Company' },
] as const;

export const FOOTER_GROUPS = [
  {
    title: 'Platform',
    links: [
      { href: '/platform#modules', label: 'Modules' },
      { href: '/platform#costing', label: 'Cost engine' },
      { href: '/platform#preview', label: 'Dashboard' },
    ],
  },
  {
    title: 'Industries',
    links: [
      { href: '/industries#printing', label: 'Printing' },
      { href: '/industries#embroidery', label: 'Embroidery' },
      { href: '/industries#uniforms', label: 'Uniforms' },
      { href: '/industries#safety', label: 'Safety products' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/company', label: 'Our approach' },
      { href: '/company#principles', label: 'Principles' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/legal/privacy', label: 'Privacy' },
      { href: '/legal/terms', label: 'Terms' },
    ],
  },
] as const;

/** The four archetypes — used by /industries and referenced from /platform. */
export const INDUSTRIES = [
  {
    id: 'printing',
    name: 'Printing',
    model: 'Job shop, make-to-order',
    driver: 'Setup amortisation + substrate area',
    problem:
      'Print is quoted on instinct because setup, waste and spoilage are never modelled. Margin is discovered at year end, sometimes negative.',
    answer:
      'Setup cost amortises across the run, substrate is consumed by area, and spoilage is a modelled percentage rather than a surprise.',
  },
  {
    id: 'embroidery',
    name: 'Embroidery',
    model: 'Machine-hour capacity',
    driver: 'Stitch count × head count',
    problem:
      'Costing per unit misprices every job, because the machine charges by time and stitches — not by how many shirts came off it.',
    answer:
      'Cost is stitch count times heads times machine rate. The digitised file is a reusable asset with its own amortisation, not an attachment on an order.',
  },
  {
    id: 'uniforms',
    name: 'Uniforms',
    model: 'Batch cut-make-trim',
    driver: 'Size-dependent fabric consumption',
    problem:
      'A 3XL consumes materially more fabric than a small. A single fixed quantity per garment under-costs large sizes silently, forever.',
    answer:
      'Consumption is a matrix across size and colour, so every variant carries its true fabric cost — and large sizes stop eating the margin.',
  },
  {
    id: 'safety',
    name: 'Safety products',
    model: 'Regulated distribution',
    driver: 'Landed cost + compliance',
    problem:
      'PPE carries certification, batch traceability, expiry and inspection duties. Handled on paper, a recall is impossible to execute.',
    answer:
      'Certification travels on the item and onto the invoice. Lots trace both ways, expired stock cannot be sold, and a recall is a query.',
  },
] as const;

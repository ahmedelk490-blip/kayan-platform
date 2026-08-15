/**
 * محتوى موقع كيان — مصدر واحد للصفحة والقائمة والفوتر.
 *
 * Content lives as data, not JSX, so the navigation, the page sections and
 * the footer sitemap cannot drift apart.
 *
 * اللهجة: عراقية مهنية — الموقع يخاطب السوق العراقي.
 */

/**
 * عنوان الموقع الرسمي.
 *
 * One source for the canonical host. It feeds metadataBase, the canonical
 * link on every page, the sitemap and robots.txt — four places that must
 * never disagree, because a canonical URL pointing at a host the sitemap
 * does not list is how a site ends up competing with itself in search.
 *
 * Overridable by environment so a staging deployment does not announce
 * itself as the production domain, and normalised without a trailing slash
 * so `${SITE_URL}/contact` never becomes a double slash.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kayan-uniform.com'
).replace(/\/$/, '');

/**
 * الصفحات القابلة للفهرسة.
 *
 * `/login` عمداً ليست منها — صفحة تحويل لفريق المصنع، لا قيمة لها في البحث
 * ولا داعي للإعلان عن واجهة النظام الداخلي في خريطة الموقع.
 */
export const INDEXABLE_ROUTES = [
  { path: '/', changeFrequency: 'monthly' as const, priority: 1 },
  { path: '/contact', changeFrequency: 'yearly' as const, priority: 0.8 },
  { path: '/legal/privacy', changeFrequency: 'yearly' as const, priority: 0.3 },
  { path: '/legal/terms', changeFrequency: 'yearly' as const, priority: 0.3 },
];

export const NAV_LINKS = [
  { href: '#products', label: 'منتجاتنا' },
  { href: '#services', label: 'الطباعة والتطريز' },
  { href: '#why', label: 'ليش كيان' },
  { href: '#quote', label: 'اطلب عرض سعر' },
] as const;

/**
 * المنتجات المعروضة — كل واحد منها له صور حقيقية على القرص.
 *
 * ⚠ لا يُعرض هنا إلا ما نملك صورته فعلاً. القبعات وزي المطاعم يصنعهما
 * المصنع، لكن لا توجد صور لهما بعد، فلا تظهر بطاقة بصورة مستعارة — البطاقة
 * الفارغة أصدق من صورة ليست لنا.
 */
export interface ProductShowcase {
  id: string;
  name: string;
  line: string;
  body: string;
  /** المجلد داخل public/products */
  folder: string;
  /** عدد الصور المتاحة، مرقّمة 01..n */
  images: number;
}

export const PRODUCTS: ProductShowcase[] = [
  {
    id: 'vest-turkish',
    name: 'اليلك التركي',
    line: 'قماش تركي · خياطة مقوّاة',
    body: 'يلك بخامة تركية تتحمل الشغل اليومي، بشرائط عاكسة وجيوب عملية. الأكثر طلباً عند شركات المقاولات والتوصيل.',
    folder: 'vest-turkish/vest-turkish-001',
    images: 6,
  },
  {
    id: 'vest-chinese',
    name: 'اليلك الصيني',
    line: 'خيار اقتصادي للكميات',
    body: 'نفس الشكل والوظيفة بسعر أنسب للكميات الكبيرة، مناسب للفرق الموسمية والفعاليات.',
    folder: 'vest-chinese/vest-chinese-001',
    images: 6,
  },
  {
    id: 'tshirts',
    name: 'التيشيرتات والبولو',
    line: 'قطن مفرّز · ألوان ثابتة',
    body: 'قصّات مريحة وألوان ما تبهت بالغسل. تنطبع وتنطرّز بشعارك بمعملنا.',
    folder: 'tshirts/tshirts-001',
    images: 6,
  },
  {
    id: 'tshirts-2',
    name: 'تيشيرت الموديل الثاني',
    line: 'ياقة وقصّة مختلفة',
    body: 'موديل ثاني لمن يريد مظهر أقرب للرسمي، بنفس جودة القماش والتطريز.',
    folder: 'tshirts/tshirts-002',
    images: 5,
  },
  {
    id: 'aprons',
    name: 'المرايل',
    line: 'مطاعم · كافيهات · مصانع',
    body: 'مرايل تتحمّل الشغل اليومي والغسل الحار، بجيوب عملية ورقبة تنضبط على المقاس.',
    folder: 'aprons/aprons-001',
    images: 4,
  },
  {
    id: 'shemagh',
    name: 'الشماغ',
    line: 'تفصيل حسب الطلب',
    body: 'شماغ بخامات مختارة وتفصيل يناسب الزي الموحد للفرق والمناسبات.',
    folder: 'shemagh/shemagh-001',
    images: 6,
  },
];

/** المنتجات التي يصنعها المصنع ولا توجد لها صور بعد. تُذكر بصدق، بلا صورة. */
export const PRODUCTS_WITHOUT_PHOTOS = [
  'القبعات والكابات',
  'زي المطاعم والصالات',
  'الزي الإداري',
  'الملابس الطبية والصناعية',
] as const;

export const SERVICES = [
  {
    id: 'printing',
    name: 'طباعة احترافية',
    body: 'سيلك سكرين وطباعة حرارية بأحبار ما تروح بالغسل. نضبطلك الألوان على عيّنة قبل ما نبدي بالكمية كلها.',
  },
  {
    id: 'embroidery',
    name: 'تطريز احترافي',
    body: 'مكاين تطريز متعددة الرؤوس، وشعارك يطلع بغرز نظيفة ما تنفك مهما استعملته.',
  },
  {
    id: 'manufacturing',
    name: 'تصنيع زي موحد',
    body: 'من اختيار القماش والقصّة حتى الخياطة والتشطيب — كله بمعملنا، بيدنا، بلا وسطاء.',
  },
  {
    id: 'solutions',
    name: 'حلول متكاملة للشركات',
    body: 'نجهّزلك الفريق كله: مقاسات لكل موظف، ألوان موحّدة، وتسليم على وجبات حسب ما يناسبك.',
  },
] as const;

export const WHY_KAYAN = [
  {
    id: 'inhouse',
    title: 'كلشي بمعملنا',
    body: 'الخياطة والطباعة والتطريز بمكان واحد — يعني وكت أقل، وإذا صار خطأ تعرف على منو.',
  },
  {
    id: 'sample',
    title: 'عيّنة قبل الكمية',
    body: 'تشوف القماش واللون والشعار على قطعة حقيقية قبل ما نبدي الإنتاج.',
  },
  {
    id: 'materials',
    title: 'خامات مجرّبة',
    body: 'نختار أقمشة مجرّبة تتحمّل الغسل المتكرر وشغل المواقع.',
  },
  {
    id: 'volume',
    title: 'أسعار تنزل مع الكمية',
    body: 'كل ما زادت الكمية نزل سعر القطعة — والتسعيرة مفصّلة بند بند، بلا مفاجآت بالآخر.',
  },
  {
    id: 'delivery',
    title: 'التزام بالموعد',
    body: 'نتفق على تاريخ تسليم مكتوب، ونسلّم على وجبات إذا كان أنسب إلك.',
  },
] as const;

/** أنواع الخدمة في نموذج طلب عرض السعر. */
export const QUOTE_SERVICES = [
  { value: 'uniforms', label: 'تصنيع زي موحد' },
  { value: 'printing', label: 'طباعة' },
  { value: 'embroidery', label: 'تطريز' },
  { value: 'safety', label: 'يلكات وملابس سلامة' },
] as const;

/**
 * رقم الواتساب يأتي من إعدادات الشركة في قاعدة البيانات (lib/catalog.ts)،
 * ليعدّله المدير من الشاشة بلا نشر. لا يُكتب هنا.
 */

/** الرسالة المبدئية في محادثة الواتساب — يعدّلها العميل قبل الإرسال. */
export const WHATSAPP_MESSAGE = 'السلام عليكم، أرغب بالاستفسار عن أسعار الزي الموحد.';

/** رابط المحادثة من رقم مخزَّن. فارغ يعني لا زر. */
export function whatsappHref(number: string | null): string | null {
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;
}

export const FOOTER_GROUPS = [
  {
    title: 'منتجاتنا',
    links: [
      { href: '#products', label: 'اليلكات' },
      { href: '#products', label: 'التيشيرتات والبولو' },
      { href: '#products', label: 'المرايل' },
      { href: '#products', label: 'الشماغ' },
    ],
  },
  {
    title: 'خدماتنا',
    links: [
      { href: '#services', label: 'الطباعة' },
      { href: '#services', label: 'التطريز' },
      { href: '#services', label: 'تصنيع الزي الموحد' },
      { href: '#services', label: 'حلول الشركات' },
    ],
  },
  {
    title: 'كيان',
    links: [
      { href: '#why', label: 'ليش كيان' },
      { href: '#quote', label: 'اطلب عرض سعر' },
    ],
  },
  {
    title: 'روابط',
    links: [
      { href: '/login', label: 'دخول النظام' },
      { href: '/legal/privacy', label: 'الخصوصية' },
      { href: '/legal/terms', label: 'الشروط' },
    ],
  },
] as const;

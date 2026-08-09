/**
 * محتوى موقع كيان — مصدر واحد للصفحة والقائمة والفوتر.
 *
 * Content lives as data, not JSX, so the navigation, the page sections and
 * the footer sitemap cannot drift apart.
 *
 * اللهجة: خليجية مهنية راقية.
 */

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
    body: 'قصّات مريحة وألوان ما تبهت مع الغسيل المتكرر. تنطبع وتنطرّز بشعارك داخل المصنع.',
    folder: 'tshirts/tshirts-001',
    images: 6,
  },
  {
    id: 'tshirts-2',
    name: 'تيشيرت الموديل الثاني',
    line: 'ياقة وقصّة مختلفة',
    body: 'موديل ثاني لمن يبي مظهر أقرب للرسمي، بنفس جودة القماش والتطريز.',
    folder: 'tshirts/tshirts-002',
    images: 5,
  },
  {
    id: 'aprons',
    name: 'المرايل',
    line: 'مطاعم · كافيهات · مصانع',
    body: 'مرايل تتحمل الاستخدام اليومي والغسيل الحار، بجيوب مدروسة ورقبة قابلة للضبط.',
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
    body: 'سيلك سكرين وطباعة حرارية بأحبار ثابتة. نضبط الألوان على عيّنة قبل ما ندخل الكمية كاملة.',
  },
  {
    id: 'embroidery',
    name: 'تطريز احترافي',
    body: 'مكاين تطريز متعددة الرؤوس، وشعارك يطلع بغرز نظيفة ما تفتك مع الاستخدام.',
  },
  {
    id: 'manufacturing',
    name: 'تصنيع زي موحد',
    body: 'من اختيار القماش والقصّة لين الخياطة والتشطيب — كله داخل المصنع، بلا وسطاء.',
  },
  {
    id: 'solutions',
    name: 'حلول متكاملة للشركات',
    body: 'نجهّز فرقك كامل: مقاسات لكل موظف، ألوان موحّدة، وتسليم على دفعات يناسب جدولك.',
  },
] as const;

export const WHY_KAYAN = [
  {
    id: 'inhouse',
    title: 'كل شي داخل المصنع',
    body: 'الخياطة والطباعة والتطريز تحت سقف واحد، يعني وقت أقل ومسؤولية واضحة على الجودة.',
  },
  {
    id: 'sample',
    title: 'عيّنة قبل الكمية',
    body: 'تشوف القماش واللون والشعار على قطعة فعلية قبل ما نبدأ الإنتاج.',
  },
  {
    id: 'materials',
    title: 'خامات مجرّبة',
    body: 'نختار الأقمشة اللي أثبتت إنها تتحمل الغسيل المتكرر وشغل المواقع.',
  },
  {
    id: 'volume',
    title: 'أسعار تنزل مع الكمية',
    body: 'كل ما كبرت الكمية نزل سعر القطعة — والتسعيرة مفصّلة بند بند بلا مفاجآت.',
  },
  {
    id: 'delivery',
    title: 'التزام بالموعد',
    body: 'نتفق على تاريخ التسليم مكتوب، ونسلّم على دفعات إذا كان أنسب لك.',
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
 * ⚠ لا توجد بيانات تواصل هنا عمداً.
 *
 * لم يُزوَّد الموقع برقم جوال أو بريد رسمي، واختراع رقم أسوأ من عدم عرضه:
 * عميل يتصل برقم غير صحيح خسارة حقيقية. نموذج طلب عرض السعر هو قناة
 * التواصل الوحيدة حتى تُزوَّد الأرقام الفعلية.
 */

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

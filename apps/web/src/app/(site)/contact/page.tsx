import { permanentRedirect } from 'next/navigation';

/**
 * «اطلب عرض سعر» صار صفحة واحدة كاملة على /quote (بطلب المالك). النموذج
 * القديم هنا كان مختلفاً (بلا منتج ولا عدد)، فالرابط القديم يحوَّل إليها.
 */
export default function ContactPage() {
  permanentRedirect('/quote');
}

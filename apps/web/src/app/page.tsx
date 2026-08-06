import { redirect } from 'next/navigation';
import { landingPathFor } from '@erp/domain';
import { getSessionUser } from '@/lib/auth';

/** الجذر يوجّه حسب الدور، أو إلى تسجيل الدخول. */
export default async function RootPage() {
  const user = await getSessionUser();
  redirect(user ? landingPathFor(user.role) : '/login');
}

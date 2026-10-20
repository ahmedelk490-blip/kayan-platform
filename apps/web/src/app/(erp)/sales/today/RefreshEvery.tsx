'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** يعيد جلب الصفحة من الخادم كل N ثانية — أرقام حيّة بلا زرّ تحديث. */
export function RefreshEvery({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}

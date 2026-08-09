'use client';

import { useEffect, useRef } from 'react';

/**
 * Fire a callback the first time a form action reports success.
 *
 * The modal uses this to close itself and refresh the list behind it. The
 * full-page routes pass nothing and are completely unaffected, which is what
 * keeps them a working fallback.
 *
 * `useActionState` keeps returning the same state object between submits, so
 * the previous value is tracked to fire on the transition into success rather
 * than on every render while success is showing.
 */
export function useFormSuccess(ok: string | undefined, onSuccess?: () => void) {
  const previous = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (ok && ok !== previous.current) onSuccess?.();
    previous.current = ok;
  }, [ok, onSuccess]);
}

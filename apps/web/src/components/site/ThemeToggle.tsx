'use client';

import { useEffect, useState } from 'react';

/**
 * مفتاح الوضع الفاتح/الداكن.
 *
 * ── Why the inline script in layout.tsx matters ─────────────
 *
 * The stored choice is applied by a blocking script in <head>, before the
 * browser paints anything. Doing it here in an effect would render one frame
 * of the wrong theme first — the white flash that gives away every
 * bolted-on dark mode.
 *
 * This component therefore never decides the initial theme. It reads what the
 * script already decided, and from then on it owns the change.
 */

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'kayan-theme';

export function ThemeToggle() {
  // Undefined until mounted: the server cannot know the visitor's choice, and
  // guessing produces a hydration mismatch.
  const [theme, setTheme] = useState<Theme | undefined>();

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'dark' : 'light');
    // Enables the colour transition only after the first paint, so the
    // initial render does not animate from a default into the stored choice.
    document.documentElement.classList.add('theme-ready');
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing can refuse storage. The theme still switches for
      // this visit; it simply will not be remembered.
    }
  }

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      // Before mount the label would be a guess, so the control is hidden
      // from assistive technology rather than announced wrongly.
      aria-hidden={theme === undefined}
      aria-pressed={theme === undefined ? undefined : isDark}
      aria-label={isDark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
      title={isDark ? 'الوضع الفاتح' : 'الوضع الداكن'}
      className="grid h-9 w-9 place-items-center rounded-full border border-edge-strong text-body-muted transition-colors hover:border-brand hover:text-brand"
    >
      {/* Both glyphs are rendered; only one is visible, so the button never
          changes width when the theme flips. */}
      <span aria-hidden className="text-sm leading-none">
        {theme === undefined ? '' : isDark ? '☀' : '☾'}
      </span>
    </button>
  );
}

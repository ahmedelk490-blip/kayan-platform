'use client';

import { useEffect, useRef } from 'react';

/**
 * نافذة منبثقة — accessible dialog.
 *
 * Built on the native `<dialog>` element rather than a div with a high
 * z-index. That is not a stylistic preference: `showModal()` gives focus
 * trapping, focus restoration, inertness of the page behind, the top layer,
 * and Escape-to-close from the browser itself. Every hand-rolled modal has
 * to reimplement those, and most reimplement them wrongly.
 *
 * What is left to do by hand is exactly one thing: closing on a backdrop
 * click, which the element does not provide.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** For forms with many fields — products, stock movements. */
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Fires for Escape as well as for `close()`, so the parent's state can
  // never drift out of step with what is actually on screen.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  /**
   * Backdrop click.
   *
   * A click on the backdrop reports the dialog itself as its target, because
   * the backdrop is a pseudo-element with no node of its own. Comparing the
   * pointer against the dialog's own box is what distinguishes "outside" from
   * "on a disabled area inside" — checking `target === dialog` alone
   * misfires when a click lands on the dialog's own padding.
   */
  function onBackdropClick(event: React.MouseEvent<HTMLDialogElement>) {
    const dialog = ref.current;
    if (!dialog || event.target !== dialog) return;

    const box = dialog.getBoundingClientRect();
    const inside =
      event.clientX >= box.left &&
      event.clientX <= box.right &&
      event.clientY >= box.top &&
      event.clientY <= box.bottom;

    if (!inside) dialog.close();
  }

  return (
    <dialog
      ref={ref}
      onClick={onBackdropClick}
      aria-labelledby="modal-title"
      aria-describedby={description ? 'modal-description' : undefined}
      className={`
        m-auto w-full rounded-xl border border-line bg-card p-0 text-txt shadow-2xl
        backdrop:bg-black/40 backdrop:backdrop-blur-[2px]
        ${wide ? 'max-w-3xl' : 'max-w-xl'}
        max-h-[92dvh]
        max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:rounded-none
      `}
    >
      {/* The dialog owns scrolling, so a long form never scrolls the page
          underneath it. */}
      <div className="flex max-h-[92dvh] flex-col max-sm:max-h-none max-sm:h-dvh">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id="modal-title" className="text-base font-semibold text-brand">
              {title}
            </h2>
            {description && (
              <p id="modal-description" className="mt-1 text-[0.7rem] text-txt-3">
                {description}
              </p>
            )}
          </div>

          {/* A form with method="dialog" closes without any JavaScript, and
              keeps working if hydration has not finished. */}
          <form method="dialog" className="shrink-0">
            <button
              type="submit"
              aria-label="إغلاق"
              className="rounded-lg border border-line-2 px-2.5 py-1 text-sm text-txt-3 transition-colors hover:border-brand hover:text-brand"
            >
              ✕
            </button>
          </form>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </dialog>
  );
}

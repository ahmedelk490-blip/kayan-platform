'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from './Modal';

/**
 * Trigger + dialog + "what to do when the form succeeds", in one place.
 *
 * Each module wraps this with its own form, because a form's props are not
 * serialisable across the server/client boundary — a render prop passed down
 * from a server component would not survive the trip. Wrapping is cheap; the
 * open/close/refresh logic lives here once.
 */
export function FormModal({
  trigger,
  title,
  description,
  wide,
  children,
}: {
  /** Rendered inside the trigger button. */
  trigger: React.ReactNode;
  title: string;
  description?: string;
  wide?: boolean;
  /** Receives the success handler to hand to the form. */
  children: (onSuccess: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const close = useCallback(() => setOpen(false), []);

  const handleSuccess = useCallback(() => {
    setOpen(false);
    // The server action already revalidated its paths; this makes the list
    // the user is looking at re-render with the new row without a full
    // navigation.
    router.refresh();
  }, [router]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="erp-btn">
        {trigger}
      </button>

      {/* Mounted only while open, so every opening starts from a clean form
          rather than showing the previous entry's values and errors. */}
      {open && (
        <Modal open={open} onClose={close} title={title} description={description} wide={wide}>
          {children(handleSuccess)}
        </Modal>
      )}
    </>
  );
}

/** Same dialog, but triggered by a quiet inline link — used for "تعديل". */
export function EditModal({
  label,
  title,
  description,
  wide,
  children,
}: {
  label: string;
  title: string;
  description?: string;
  wide?: boolean;
  children: (onSuccess: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const close = useCallback(() => setOpen(false), []);
  const handleSuccess = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-brand hover:underline"
      >
        {label}
      </button>

      {open && (
        <Modal open={open} onClose={close} title={title} description={description} wide={wide}>
          {children(handleSuccess)}
        </Modal>
      )}
    </>
  );
}

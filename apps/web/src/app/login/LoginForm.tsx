'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-primary-600 px-5 py-3 text-sm font-medium text-neutral-50 transition-colors hover:bg-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'جارٍ الدخول…' : 'تسجيل الدخول'}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div>
        <label htmlFor="email" className="mb-2 block text-xs text-neutral-400">
          البريد الإلكتروني
        </label>
        <input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="username"
          required
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? 'email-error' : undefined}
          className="w-full rounded-lg border border-ink-700 bg-ink-900/60 px-4 py-3 text-start text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="you@kayan.eg"
        />
        {state.fieldErrors?.email && (
          <p id="email-error" className="mt-2 text-xs text-danger-500">
            {state.fieldErrors.email}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="mb-2 block text-xs text-neutral-400">
          كلمة المرور
        </label>
        <input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby={state.fieldErrors?.password ? 'password-error' : undefined}
          className="w-full rounded-lg border border-ink-700 bg-ink-900/60 px-4 py-3 text-start text-sm text-neutral-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {state.fieldErrors?.password && (
          <p id="password-error" className="mt-2 text-xs text-danger-500">
            {state.fieldErrors.password}
          </p>
        )}
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-danger-500/40 bg-danger-500/10 px-4 py-3 text-xs text-danger-500"
        >
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

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
      className="w-full rounded-lg bg-brand px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
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
        <label htmlFor="email" className="mb-2 block text-xs text-txt-3">
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
          className="w-full rounded-lg border border-field bg-card px-4 py-3 text-start text-sm text-txt placeholder:text-txt-4 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          placeholder="you@kayan.eg"
        />
        {state.fieldErrors?.email && (
          <p id="email-error" className="mt-2 text-xs text-bad">
            {state.fieldErrors.email}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="mb-2 block text-xs text-txt-3">
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
          className="w-full rounded-lg border border-field bg-card px-4 py-3 text-start text-sm text-txt focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
        {state.fieldErrors?.password && (
          <p id="password-error" className="mt-2 text-xs text-bad">
            {state.fieldErrors.password}
          </p>
        )}
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-bad bg-bad-soft px-4 py-3 text-xs text-bad"
        >
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

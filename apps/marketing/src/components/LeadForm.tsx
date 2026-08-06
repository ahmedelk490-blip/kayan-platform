'use client';

import { useState } from 'react';
import { cn } from '@erp/utils';
import { INDUSTRIES } from '@/site';

type Status = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Demo request — the conversion surface.
 *
 * Styled toward the ERP philosophy rather than the cinematic one: a form is a
 * task, and decorating a task makes it slower. Validation messages are text,
 * not colour alone, and every error is tied to its field for screen readers.
 */
export function LeadForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('submitting');
    setErrors({});
    setFormError('');

    const data = new FormData(event.currentTarget);
    const payload = {
      name: String(data.get('name') ?? ''),
      company: String(data.get('company') ?? ''),
      email: String(data.get('email') ?? ''),
      phone: String(data.get('phone') ?? ''),
      message: String(data.get('message') ?? ''),
      interests: data.getAll('interests').map(String),
    };

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setStatus('success');
        return;
      }

      const body = await response.json().catch(() => null);
      if (response.status === 422 && body?.errors) {
        const mapped: Record<string, string> = {};
        for (const item of body.errors as { field: string; reason: string }[]) {
          mapped[item.field] = item.reason;
        }
        setErrors(mapped);
        setFormError('Please correct the highlighted fields.');
      } else {
        setFormError(body?.error ?? 'Something went wrong. Please try again.');
      }
      setStatus('error');
    } catch {
      setFormError('We could not reach the server. Please check your connection.');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div
        role="status"
        className="rounded-2xl border border-accent/30 bg-accent/[0.05] p-8 md:p-10"
      >
        <h2 className="font-display text-2xl text-neutral-100">Thank you — that is with us.</h2>
        <p className="mt-4 max-w-[48ch] text-sm leading-relaxed text-neutral-300">
          We will come back to you within one working day. If you have a quotation or an
          estimating spreadsheet you would like costed in the demo, bring it — that is the
          fastest way to see whether this is worth your time.
        </p>
      </div>
    );
  }

  const fieldClass = (name: string) =>
    cn(
      'w-full rounded-xl border bg-ink-900/60 px-4 py-3 text-sm text-neutral-100',
      'placeholder:text-neutral-600 transition-colors',
      'focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent',
      errors[name] ? 'border-red-400/60' : 'border-ink-700',
    );

  const Label = ({ htmlFor, children, optional }: { htmlFor: string; children: React.ReactNode; optional?: boolean }) => (
    <label htmlFor={htmlFor} className="mb-2 block text-xs uppercase tracking-[0.14em] text-neutral-400">
      {children}
      {optional && <span className="ms-2 normal-case tracking-normal text-neutral-600">optional</span>}
    </label>
  );

  const Error = ({ name }: { name: string }) =>
    errors[name] ? (
      <p id={`${name}-error`} className="mt-2 text-xs text-red-300">
        {errors[name]}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Your name</Label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            required
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'name-error' : undefined}
            className={fieldClass('name')}
            placeholder="Mahmoud Hassan"
          />
          <Error name="name" />
        </div>
        <div>
          <Label htmlFor="company">Company</Label>
          <input
            id="company"
            name="company"
            autoComplete="organization"
            required
            aria-invalid={Boolean(errors.company)}
            aria-describedby={errors.company ? 'company-error' : undefined}
            className={fieldClass('company')}
            placeholder="Delta Printing & Safety"
          />
          <Error name="company" />
        </div>
        <div>
          <Label htmlFor="email">Work email</Label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            className={fieldClass('email')}
            placeholder="you@company.com"
          />
          <Error name="email" />
        </div>
        <div>
          <Label htmlFor="phone" optional>
            Phone
          </Label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            className={fieldClass('phone')}
            placeholder="+20 ..."
          />
          <Error name="phone" />
        </div>
      </div>

      <fieldset>
        <legend className="mb-3 text-xs uppercase tracking-[0.14em] text-neutral-400">
          What do you produce?
          <span className="ms-2 normal-case tracking-normal text-neutral-600">optional</span>
        </legend>
        <div className="flex flex-wrap gap-2.5">
          {INDUSTRIES.map((industry) => (
            <label
              key={industry.id}
              className="cursor-pointer rounded-full border border-ink-700 px-4 py-2 text-sm text-neutral-300 transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:checked]:text-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
            >
              <input type="checkbox" name="interests" value={industry.id} className="sr-only" />
              {industry.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <Label htmlFor="message" optional>
          What would you like costed?
        </Label>
        <textarea
          id="message"
          name="message"
          rows={4}
          className={cn(fieldClass('message'), 'resize-y')}
          placeholder="A 500-piece hi-vis order, printed and embroidered, in a size matrix…"
        />
        <Error name="message" />
      </div>

      {formError && (
        <p role="alert" className="text-sm text-red-300">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-5 pt-2">
        <button
          type="submit"
          disabled={status === 'submitting'}
          className={cn(
            'rounded-full bg-accent px-7 py-3.5 text-sm font-medium text-on-accent',
            'transition-opacity focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            status === 'submitting' && 'cursor-not-allowed opacity-60',
          )}
        >
          {status === 'submitting' ? 'Sending…' : 'Request a demo'}
        </button>
        <p className="text-xs text-neutral-500">
          We reply within one working day. No newsletter, no sequence.
        </p>
      </div>
    </form>
  );
}

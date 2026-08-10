import 'server-only';

/**
 * Types a `'use server'` module cannot export — it may only export async
 * functions. Same split every other module in this codebase uses.
 */

export interface FormState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

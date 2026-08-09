import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The tenant of the current request.
 *
 * Kept in AsyncLocalStorage rather than threaded through forty call sites,
 * so that every existing server action keeps working unchanged while the
 * database still receives a tenant on every query. The guard sets it once
 * per request, immediately after the session is resolved.
 *
 * `enterWith` rather than `run`: the guard returns to its caller, and the
 * work that needs the tenant happens after that return. `run` would end the
 * context at the guard's own boundary.
 */
const store = new AsyncLocalStorage<string>();

export function setCurrentTenant(tenantId: string): void {
  store.enterWith(tenantId);
}

/**
 * Undefined before a session is resolved — during login, for instance.
 * Callers must not paper over that: a query with no tenant is denied by the
 * database, which is the intended behaviour, not a bug to work around.
 */
export function currentTenant(): string | undefined {
  return store.getStore();
}

# Phase 6.5b — Critical forms as modals

**Status:** delivered · **Date:** 2026-08-09 · **Tag:** `phase-06-5-critical-forms-modal`

Scope held to the four forms named. Quotations, sales orders and production
orders were not touched. No business logic changed.

---

## The four forms

| Form | Trigger | Mode |
|---|---|---|
| **تسجيل حركة مخزون** (highest priority) | `/inventory` header | create |
| **عميل** | `/customers` header + per-row تعديل | create + edit |
| **منتج** | `/products` header + per-row تعديل | create + edit |
| **مورّد** | `/suppliers` header + per-row تعديل | create + edit |

---

## Built on `<dialog>`, not a floating div

`showModal()` gives focus trapping, focus restoration, inertness of the page
behind, top-layer stacking, and Escape-to-close **from the browser**. A
hand-rolled modal has to reimplement all of that, and most reimplement it
wrongly — which is how modals end up letting Tab escape behind the overlay.

Exactly one behaviour is left to do by hand: closing on a backdrop click,
which the element does not provide. That is done by comparing the pointer
against the dialog's own box, not by `event.target === dialog` alone — the
naive check misfires when a click lands on the dialog's own padding.

The close button is a `<form method="dialog">`, so it works even before
hydration finishes.

**Closes via:** ✕ button · Escape · click outside — all three verified by the
element's own `close` event, which keeps React state from drifting out of
step with what is actually on screen.

**Mobile:** below `sm` the dialog goes full-screen (`h-dvh`, no radius). The
dialog owns its own scrolling, so a long product form never scrolls the list
underneath it.

---

## How business logic stayed untouched

The create actions used to end in `redirect()`, which is the wrong ending for
a modal — it navigates away from the list the user is working in.

Rather than duplicating each action, the create logic was extracted into a
private `create…Core()` and **both** entry points call it:

```
createCustomerCore(formData)        ← validation, RBAC, numbering, audit
   ├── createCustomer()             → redirect to the new record   (full page)
   └── createCustomerInline()       → return { ok }                (modal)
```

Same for products and suppliers. Validation, permissions, code generation,
Decimal handling and the audit entry are identical because they are literally
the same code — there is no second implementation that can drift.

Stock movements needed no change at all: `postMovement` already returned
`{ ok }` rather than redirecting.

`update…` actions now return `{ ok: 'تم حفظ التعديلات.' }` instead of `{}`.
That is the only behavioural change, and it is additive — the full-page routes
now show a save confirmation they previously lacked.

---

## How the modal knows it succeeded

A shared `useFormSuccess(state.ok, onSuccess)` hook fires once on the
transition into success. `useActionState` returns the same object between
submits, so the previous value is tracked rather than firing on every render.

Each form component gained one optional prop, `onSuccess`. When it is absent —
which is exactly the full-page case — nothing changes. That is what keeps the
old routes a genuine fallback rather than a broken one.

On success the modal closes and calls `router.refresh()`, so the list behind
it re-renders with the new row without a navigation. The server action has
already revalidated its paths.

The dialog is **unmounted while closed**, so every opening starts from a clean
form rather than showing the previous entry's values and validation errors.

---

## Validation errors inside the modal

Unchanged and working: the actions return `fieldErrors`, the same `Field`
components render them with `aria-describedby`, and the dialog scrolls to keep
them visible. Because the dialog only closes on `ok`, a rejected submit leaves
the modal open with the user's input intact — which is the entire reason not
to close on submit.

---

## RBAC

Every trigger is still gated on the same permission as before
(`inventory.write`, `customers.write`, `products.write`, `suppliers.write`),
and every server action still calls `requirePermission` itself. Hiding a
button remains courtesy; the guard is the security.

The product modal's option lists are loaded **only** when the user can open it.

---

## Full-page routes kept

`/customers/new`, `/products/new`, `/suppliers/new` and the `[id]` edit pages
all still work, unchanged. They are reachable directly and are the fallback if
JavaScript is unavailable.

The one layout change: the inventory movement form no longer occupies a
permanent side column, because it is now the modal. The stock and movement
tables get the full width — which matters for a ledger an operator actually
reads.

---

## Checks

`npm run lint` · `npm run typecheck` · `npm run build` — all clean, no
warnings.

The six verification suites still pass unchanged (186 assertions), since no
business logic moved.

---

## Not done / honest caveats

1. **Screenshots are pending your sign-in.** The preview pane lost its session
   cookie when it restarted, and I do not type passwords into login fields.
   Sign in at `http://localhost:3300/login` and I will capture the three
   screenshots immediately.

2. **The per-row edit modal loads every row's form values with the list.** For
   the current page sizes (25 rows) that is a few extra columns per row. If a
   list ever grows wide, the values should be fetched on open instead.

3. **`useFormSuccess` fires on the value of `ok`, not on a submit token.** Two
   consecutive identical successes — creating the same-named record twice —
   still fire correctly because the generated code differs each time. If an
   action is ever added whose success message is constant *and* which can
   legitimately succeed twice in a row without the modal closing in between,
   it will need a nonce. None of the four is such a case today.

4. **Not converted, as instructed:** quotations, sales orders, production
   orders, and the secondary forms (variants, activities, supplier-product
   links, formula lines, penalties).

---

## Files

**New:** `components/crud/Modal.tsx` · `components/crud/FormModal.tsx` ·
`components/crud/useFormSuccess.ts` · `inventory/MovementModal.tsx` ·
`customers/CustomerModal.tsx` · `products/ProductModal.tsx` ·
`suppliers/SupplierModal.tsx`

**Changed:** the four list pages · the four form components (one optional
prop each) · `customers/actions.ts`, `products/actions.ts`,
`suppliers/actions.ts` (core extraction + inline entry points)

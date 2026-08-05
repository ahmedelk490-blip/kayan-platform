# 01 — Project Vision

**Version:** 1.0
**Date:** 2026-08-05
**Status:** APPROVED FOUNDATION (per client directive, 2026-08-05)

---

## 1. Vision Statement

A modern, multi-tenant ERP built specifically for companies that **print, embroider, manufacture uniforms, and distribute safety equipment** — often on the same order.

Generic ERPs treat these as four unrelated catalogue categories. They are not. They are four manufacturing archetypes with incompatible costing models, and the value of this product is that it models them natively instead of forcing them into a distribution-shaped schema.

## 2. The Problem We Solve

A company in this industry running SAP B1, Odoo, or a stack of spreadsheets faces the same four failures:

| Failure | Cause | Consequence |
|---|---|---|
| Print jobs priced by instinct | Setup amortisation and waste are not modelled | Margin unknown until year end — sometimes negative |
| Large uniform sizes lose money | BOM consumption is a scalar, not size-dependent | Silent, permanent margin erosion on 2XL+ |
| Embroidery capacity mis-sold | Costing by unit, not stitch count × heads | Machines idle or over-committed |
| PPE compliance handled on paper | No lot, expiry, or certification tracking | Legal exposure; recalls impossible to execute |

## 3. What Makes This Product Different

1. **Six product archetypes, natively modelled** — Printing, Embroidery, Uniform Manufacturing, Safety Products, Custom, and **Hybrid** (the combination case).
2. **A cost engine where every number is traceable.** Not a total — an auditable derivation tree from raw input to gross margin.
3. **Admin-editable production formulas**, versioned, with historical cost sheets immune to later edits.
4. **A configurable tax engine.** No jurisdiction is compiled into the product.
5. **Arabic-first, genuinely bidirectional.** RTL is an architectural constraint, not a stylesheet.
6. **One codebase, two deployment models** — multi-tenant SaaS and dedicated on-premise.

## 4. Target Users

Printing houses, embroidery workshops, uniform manufacturers, and PPE distributors — from a 15-person workshop to a 500-person multi-branch group.

Primary market: **Egypt and the wider MENA region.** Base currency EGP; unlimited currencies supported.

## 5. Product Principles

| # | Principle | Consequence in practice |
|---|---|---|
| P1 | Correctness beats convenience in finance | The ledger never updates or deletes. Reversals only. |
| P2 | Every number explains itself | Any figure can be traced to its inputs and formula version |
| P3 | Configuration over customisation | Tax, formulas, workflows, and CoA are data, not code |
| P4 | The domain owns the rules | Business logic is framework-independent and unit-testable |
| P5 | Gaps are stated | An unimplemented capability says so. Silence reads as coverage. |
| P6 | Arabic is not a translation layer | RTL and Arabic typography are first-class |

## 6. Success Criteria

| # | Criterion | Measure |
|---|---|---|
| SC-1 | Hybrid item is expressible | A printed + embroidered certified uniform is one sellable item |
| SC-2 | Cost accuracy | Computed job cost within 5% of actual post-production |
| SC-3 | Full traceability | Any cost figure traced to inputs in ≤3 clicks |
| SC-4 | Tax portability | New jurisdiction configured without a code change |
| SC-5 | Ledger integrity | Trial balance always balances; 100% branch test coverage |
| SC-6 | Deployment parity | Identical build runs SaaS and on-premise |
| SC-7 | Arabic parity | Every screen fully usable in Arabic RTL |

## 7. Non-Goals

- Not a clone of Odoo or SAP B1. Depth in four verticals beats breadth.
- Not a general-purpose manufacturing ERP (no process/chemical/discrete-electronics).
- Not a payroll system. Employee penalties post *to* payroll; they do not compute it. **[OPEN-30]**

## 8. Related Documents

[02_SRS](02_SRS.md) · [03_System_Architecture](03_System_Architecture.md) · [04_Database_Design](04_Database_Design.md) · [05_User_Roles](05_User_Roles.md) · [06_API_Design](06_API_Design.md) · [07_UI_UX](07_UI_UX.md) · [08_Development_Roadmap](08_Development_Roadmap.md)

## 9. Change Log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-08-05 | Initial vision, ratified against client foundation directive |

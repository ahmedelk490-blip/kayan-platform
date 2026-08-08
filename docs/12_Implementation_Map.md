# 12 — Implementation Map

**Version:** 1.0
**Date:** 2026-08-06
**Status:** AUDIT — measured from the codebase, not from plans
**Commit audited:** `ecb14f9`

> ⚠️ **This is a snapshot taken before Phase 2.** It was accurate on
> 2026-08-06 and is now substantially out of date: Phases 2, 3, 4, 4.5 and 5
> have since been built and frozen. Only §8 Manufacturing has been refreshed
> in place, because Phase 5 touched it directly.
>
> For current state read the phase reports, which are the authority:
> `14_Phase3_Report.md`, `15_Phase4_Report.md`,
> `16_Phase45_Decimal_Report.md`, `17_Phase5_Manufacturing_Report.md`.
>
> A full re-audit of this document is outstanding work.

---

## 0. How to read this

Every number here was **counted from files on disk**, not taken from a design document. Where something does not exist, it says *Not started* — it does not say "planned".

**Headline:** 46 source files, **3,440 lines**, one application. The marketing website exists. **The ERP does not exist in any form** — no database, no backend, no authentication, no dashboards. Everything ERP-related lives in documentation only.

| Measured | Count |
|---|---:|
| Applications built | 1 of 6 (`marketing`) |
| Packages built | 4 of 7 |
| Routes live | 7 pages + 1 API |
| Source files | 46 |
| Lines of code | 3,440 |
| Prisma schemas | **0** |
| SQL migrations | **0** |
| NestJS modules | **0** |
| Test files | **0** |
| Dockerfiles | **0** |
| CI workflows | **0** |
| Product images imported | **0** |

---

## 1. Marketing Website

### 1.1 Live routes

| Route | Status | Sections | Components | Animation | 3D | Responsive |
|---|---|---|---|---|---|---|
| `/` | **Complete** (off-message) | Hero, The Making, The Control, Proof | `Hero`, `TheMaking`, `TheControl`, `Proof` | Scroll-scrub, staggered reveal, counting numbers | **Yes** — `HeroWeaveScene`, 8,400 pts | ✅ 375 / 768 / 1280 |
| `/platform` | **Complete** (to be deleted) | Cost engine, Modules grid | `PageHero`, `CostSheetPreview`, `CtaBand` | Word reveal, expandable tree | No | ✅ |
| `/industries` | **Complete** (to be deleted) | 4 archetypes, Hybrid | `PageHero`, `SectionShell`, `CtaBand` | Word reveal | No | ✅ |
| `/company` | **Complete** (to be deleted) | Approach, Figures, Principles | `PageHero`, `CountingNumber`, `CtaBand` | Counting numbers | No | ✅ |
| `/contact` | **Complete** | Lead form, What to expect | `PageHero`, `LeadForm` | Field focus only | No | ✅ |
| `/legal/privacy` | **Complete** (draft content) | Policy body | `LegalBody`, `LegalNotice` | None | No | ✅ |
| `/legal/terms` | **Complete** (draft content) | Terms body | `LegalBody`, `LegalNotice` | None | No | ✅ |
| `/api/leads` | **Complete** | — | Validation + rate limit + JSONL | — | — | — |

**Global chrome:** `Navigation` (sticky morph pill, mobile menu, KAYAN logo), `SiteFooter` (sitemap, Arabic tagline, slogan, oversized logotype), `BrandIntro` (8-beat opening signature), `ScrollProgress`, `SmoothScroller`.

### 1.2 Missing routes

Every route below is **Not started** — no file exists:

`/services` · `/services/[slug]` (×8) · `/products` · `/products/[slug]` (×5) · `/journey` · `/gallery` · `/technology` · `/about` · `/login` · `/login/customer` · `/login/employee` · `/login/erp` · `/login/admin`

**4 of 14 planned routes are valid and live.** Three more exist but sell ERP software rather than uniforms and are scheduled for deletion.

### 1.3 Content accuracy

| Issue | Where |
|---|---|
| Headline "Enterprise ERP for makers" — sells software, not uniforms | `/` Hero |
| Statistics describe the software project (`219`, `130`, `16`, `10`), not KAYAN | `/`, `/company` |
| Placeholder names in form fields ("Delta Printing & Safety") | `/contact` |
| Legal pages carry a visible "Draft — pending legal review" banner | `/legal/*` |

---

## 2. UI / Design System

| Element | Status | Detail |
|---|---|---|
| **Colour palette** | ✅ Complete | 11-step primary maroon sampled from the logo (`#5c2334`), 5-step ink, 11-step warm neutral, 3 status colours. Light + dark mode. |
| **Typography** | ✅ Complete | Space Grotesk (display), Inter (body), IBM Plex Sans Arabic. 4 fluid display sizes. |
| **Motion system** | ✅ Complete | 3 easing curves, 4 durations, `usePrefersReducedMotion` |
| **Icons** | ❌ **Not started** | `packages/icons` was directed but never created. Zero icons — the UI uses text and CSS shapes only. |
| **Buttons** | ⚠️ Partial | `MagneticButton` only (solid + outline). No sizes, no icon/loading/disabled variants. |
| **Inputs** | ⚠️ Partial | Text, email, tel, textarea, checkbox — all inline in `LeadForm`, not extracted as components. |
| **Forms** | ⚠️ Partial | One form (`LeadForm`) with validation and a11y wiring. No reusable form primitives. |
| **Cards** | ❌ Not started | Card-like styling is inline Tailwind in page files. No component. |
| **Tables** | ❌ Not started | `CostSheetPreview` renders a tree with divs. No table component. |
| **Modals** | ❌ Not started | None. |
| **Charts** | ❌ **Not started** | `packages/charts` was directed but never created. |
| **`ui-erp`** | ❌ **Not started** | Directed but never created. No ERP component exists. |

**3 of 7 directed packages are missing:** `icons`, `charts`, `ui-erp`.

### 2.1 Components that exist (12)

`MagneticButton` · `AnimatedText` · `CountingNumber` · `SectionShell` · `ScrollProgress` · `SmoothScroller` · `SceneAnchor` · `CanvasHost` · `Logo` · `PageHero` · `CtaBand` · `LegalBody`

---

## 3. Images & Products

**Nothing has been imported. This section is the honest zero.**

| Item | Count |
|---|---:|
| Product images in the project | **0** |
| Products defined in code | **0** |
| Categories connected | **0** |
| Gallery | **Does not exist** |
| Total assets in `public/` | **1** — `kayan-logo.jpg` (3.7 KB) |

### 3.1 Google Drive — verified, not imported

Access was confirmed and one sample was downloaded to a temp folder for inspection. **No file was brought into the repository.**

| Category | Folder ID | Enumerated? |
|---|---|---|
| المريلات — Aprons | `1TAG0GmZ7VhL6vLar11CSlzBPSwQ270_V` | ❌ |
| تيشيرتات — T-shirts | `1AYakFI8nsj53I8BioqLuM2gIZi2anRr1` | ✅ 2 models; model 1 = 12 PNGs |
| شفقات — Shemagh | `1ThEX4sL7lsZ6DjfXUhbCtMG7gECTGm0R` | ❌ |
| يلك تركي — Turkish vest | `18LhRQjpBs5dHjatoPEhQgLs5o_o5uz7n` | ❌ |
| يلك صيني — Chinese vest | `10tv9QoG-uGEMYU2_X_uQ588_94bA2GqK` | ❌ |

**Products still missing:** all of them. Additionally the Drive covers only **4 of the 8 directed services** — no imagery exists for caps, restaurant uniforms, corporate uniforms, or for the embroidery and printing processes.

### 3.2 Services

The 8 directed services (Embroidery, Printing, Safety Vests, T-Shirts, Aprons, Caps, Restaurant Uniforms, Corporate Uniforms) exist **only as prose in `11_Sitemap.md`**. They are not in code, not in `site.ts`, and have no page.

`site.ts` still contains the old 4-item `INDUSTRIES` array written for the ERP-vendor positioning.

---

## 4. ERP

**Not started. Zero lines of ERP code exist.**

| Module | Status |
|---|---|
| PLT · Platform & Tenancy | ❌ Not started |
| IAM · Identity & Access | ❌ Not started |
| STG · Settings | ❌ Not started |
| MDM · Master Data | ❌ Not started |
| INV · Inventory | ❌ Not started |
| FRM · Formula Engine | ❌ Not started |
| MFG · Manufacturing | ❌ Not started |
| CST · Cost Engine | ❌ Not started |
| PUR · Purchasing | ❌ Not started |
| CRM · CRM & Sales | ❌ Not started |
| FIN · Finance | ❌ Not started |
| TAX · Tax Engine | ❌ Not started |
| DMG · Damage & Penalties | ❌ Not started |
| HRM · Human Resources | ❌ Not started |
| NTF · Notifications | ❌ Not started |
| RPT · Reporting | ❌ Not started |
| ECM · E-commerce | ❌ Not started |
| AIL · AI Layer | ❌ Not started |

**0 of 18 modules.** `apps/api`, `apps/web`, `apps/worker`, `apps/portal`, `apps/shopfloor` do not exist as directories.

The only ERP-adjacent code is `CostSheetPreview.tsx` (221 lines) — a **marketing mock-up** on the `/platform` page with hardcoded numbers. It computes nothing and connects to nothing.

---

## 5. Login

**What happens when you click Login today: nothing. There is no Login link and no `/login` route.**

| Question | Answer |
|---|---|
| Where does the CTA go? | `/contact` — a lead form. Not a login. |
| What authentication exists? | **None.** No password hashing, no sessions, no tokens, no MFA, no user table. |
| Which dashboards exist? | **None.** |
| Which roles exist? | **None in code.** 17 actors are described in `02_SRS.md`; zero are implemented. |

---

## 6. Dashboards

| Dashboard | Status | Widgets implemented |
|---|---|---|
| Manager | ❌ Not started | 0 |
| Sales | ❌ Not started | 0 |
| Customer | ❌ Not started | 0 |
| Admin | ❌ Not started | 0 |

**No dashboard file exists in the repository.**

---

## 7. Database

| Item | Count |
|---|---:|
| Tables implemented | **0** |
| Relationships implemented | **0** |
| Migrations | **0** |
| Prisma schema files | **0** |
| Database connection | **None** |
| PostgreSQL installed/configured | **No** |

**Missing tables: all 130** designed in `04_Database_Design.md` across 15 domains.

The only persistence anywhere in the project is `apps/marketing/.leads/leads.jsonl` — an append-only text file written by the lead form, holding plain-text PII, explicitly marked interim in code.

---

## 8. Manufacturing

*Refreshed 2026-08-09 after Phase 5. Detail in `17_Phase5_Manufacturing_Report.md`.*

| Capability | Status |
|---|---|
| Production Orders | ✅ Complete — CRUD, workflow, `MO-YYYY-NNNN`, soft delete, audit |
| Work Orders (named steps) | ✅ Complete — sequence + status, deliberately thin |
| Sales Order ↔ Production Order link | ✅ Complete — both directions, status propagation |
| Finished-goods receipt on completion | ✅ Complete — idempotent, DB-enforced |
| Assigned Employees | ⚠️ Relation only — no UI, as specified |
| Estimated / Actual Cost | ⚠️ Fields only — empty until the Cost Engine exists |
| Material issue on start | ⚠️ Not built — needs a BOM; see the deviation note in the Phase 5 report |
| Formula Engine | ❌ Not started |
| Printing Formula | ❌ Not started |
| Embroidery Formula | ❌ Not started |
| Cost Engine | ❌ Not started |
| Damage | ❌ Not started |
| Waste | ❌ Not started |
| Expenses | ❌ Not started |
| Roll Formula | ❌ Not started |
| Ink Formula | ❌ Not started |
| Automatic Cost Calculation | ❌ Not started |

**4 of 17 complete, 3 partial by design.** The cost figures shown on
`/platform` are still hardcoded constants in a React file for display
purposes — no cost is calculated anywhere in the system.

---

## 9. Reports

**0 reports implemented.** No report, export, PDF, XLSX or CSV generation exists anywhere in the codebase.

---

## 10. Permissions

| Item | Status |
|---|---|
| Roles implemented | **0** |
| Permissions implemented | **0** |
| RBAC engine | ❌ Not started |
| Row-level security | ❌ Not started |
| Audit log | ❌ Not started |

---

## 11. API

**1 endpoint exists in the entire project.**

| API | Endpoint | Status |
|---|---|---|
| Lead intake | `POST /api/leads` | ✅ Complete — strict validation, 5/min rate limit, JSONL append |
| Authentication | — | ❌ Not started |
| Products | — | ❌ Not started |
| Customers | — | ❌ Not started |
| Sales | — | ❌ Not started |
| Inventory | — | ❌ Not started |
| Manufacturing | — | ❌ Not started |

---

## 12. Project Structure

```
erp-platform/
├── docs/                            7 governed documents
│   ├── 00_Constitution.md
│   ├── 01_Project_Vision.md
│   ├── 02_SRS.md
│   ├── 03_System_Architecture.md
│   ├── 04_Database_Design.md
│   ├── 07_UI_UX.md
│   ├── 11_Sitemap.md
│   └── 12_Implementation_Map.md     ← this file
│
├── apps/
│   └── marketing/                   THE ONLY APPLICATION
│       ├── public/
│       │   └── brand/
│       │       ├── kayan-logo.jpg   3.7 KB — the only image
│       │       └── README.md
│       └── src/
│           ├── app/
│           │   ├── layout.tsx
│           │   ├── page.tsx
│           │   ├── globals.css
│           │   ├── api/leads/route.ts
│           │   ├── company/page.tsx
│           │   ├── contact/page.tsx
│           │   ├── industries/page.tsx
│           │   ├── platform/page.tsx
│           │   └── legal/{privacy,terms}/page.tsx
│           ├── components/
│           │   ├── Navigation.tsx        CanvasMount.tsx
│           │   ├── SiteFooter.tsx        IntroMount.tsx
│           │   ├── PageHero.tsx          CtaBand.tsx
│           │   ├── LeadForm.tsx          LegalBody.tsx
│           │   ├── CostSheetPreview.tsx
│           │   └── sections/
│           │       ├── Hero.tsx          TheMaking.tsx
│           │       └── TheControl.tsx    Proof.tsx
│           └── site.ts
│
├── packages/
│   ├── brand/      index.ts · Logo.tsx · tokens.css
│   ├── motion/     index.ts
│   ├── utils/      index.ts
│   └── ui-market/
│       ├── canvas/     CanvasHost · SceneAnchor · scene-store
│       ├── intro/      BrandIntro · IntroScene · intro-phases · intro-clock
│       ├── primitives/ MagneticButton · AnimatedText · CountingNumber · SectionShell
│       ├── scenes/     HeroWeaveScene
│       └── scroll/     SmoothScroller · ScrollProgress
│
├── package.json · turbo.json · tsconfig.json · .gitignore
│
└── NOT PRESENT:
    apps/api · apps/web · apps/worker · apps/portal · apps/shopfloor
    packages/icons · packages/charts · packages/ui-erp
    packages/domain · packages/contracts · packages/formula · packages/decimal
    prisma/ · migrations/ · tests/ · .github/ · Dockerfile
```

---

## 13. Screenshots

Screenshots can only be produced for pages that exist.

| Requested | Available? |
|---|---|
| Homepage | ✅ Captured |
| Login | ❌ Route does not exist |
| Manager Dashboard | ❌ Does not exist |
| Sales Dashboard | ❌ Does not exist |
| Products | ❌ Route does not exist |
| Customers | ❌ Does not exist |
| Inventory | ❌ Does not exist |
| Manufacturing | ❌ Does not exist |
| Reports | ❌ Does not exist |
| Settings | ❌ Does not exist |

**1 of 10 requested screens exists.** Additional capturable pages not on the list: `/platform`, `/industries`, `/company`, `/contact`, `/legal/*`.

---

## 14. Final Status

Percentages are measured against what the governed documents specify, with the basis stated so the number can be checked.

| Area | Complete | Basis |
|---|---:|---|
| **Marketing website** | **29%** | 4 valid live routes of 14 planned. Shell, brand, intro and 3D are done; all content pages missing. |
| **ERP** | **0%** | 0 of 18 modules |
| **Authentication** | **0%** | No user, session, or password code exists |
| **Database** | **0%** | 0 of 130 tables |
| **Manufacturing** | **0%** | 0 of 11 capabilities |
| **Accounting** | **0%** | 0 of 22 FIN requirements |
| **Reports** | **0%** | 0 reports |
| **Design system** | **45%** | Tokens, type and motion complete; icons, charts, cards, tables, modals and `ui-erp` missing |
| **Product content** | **0%** | 0 images, 0 products, 0 services in code |
| **OVERALL** | **≈6%** | 3,440 lines against a 219-requirement, 130-table specification |

### 14.1 The honest summary

**What is real:** a well-built marketing shell — KAYAN brand system sampled from the logo, an 8-beat cinematic intro on a single WebGL canvas, a scroll-driven 3D hero, working navigation and footer, a validated lead-capture endpoint, and 7 responsive pages that build clean at 172 kB First Load JS.

**What is not real:** everything else. There is no ERP, no database, no login, no dashboard, no product, and no imported image. Three of the seven live pages sell ERP software rather than KAYAN uniforms and are scheduled for deletion.

**Two risks this audit surfaces that were not previously stated as measurements:**

1. **Zero tests exist.** `NFR-20` requires 100% branch coverage on the ledger, cost engine, tax engine and formula evaluator. The count today is 0 test files across the whole repository.
2. **Three directed packages were never created** — `icons`, `charts`, `ui-erp` — so any claim that the design system is "in place" is only 45% true.

---

## 15. Change Log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-08-06 | Initial audit at `ecb14f9`. 46 files, 3,440 lines measured. ERP, database, auth, dashboards, reports and permissions confirmed at zero. |

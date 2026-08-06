# 11 — Marketing Website Sitemap

**Version:** 1.0
**Date:** 2026-08-06
**Status:** PROPOSED — approval requested before page implementation
**Governed by:** [00_Constitution](00_Constitution.md) · [07_UI_UX](07_UI_UX.md)

---

## 1. Repositioning — what changed

Milestone 2 built the site as **an ERP vendor selling software to other manufacturers**: headline "Enterprise ERP for makers", a modules grid, a cost engine pitch, an industries page addressed to rival factories.

The KAYAN identity says something different. KAYAN **makes safety vests, t-shirts, aprons, caps and corporate/restaurant uniforms**, with embroidery and printing. The brand experience line is *"Premium Uniform Manufacturing powered by Technology."*

**The site therefore sells uniforms. The ERP is proof of capability, not the product.** A buyer sourcing 500 branded polos is the audience; the technology matters because it makes KAYAN faster, traceable and precise — not because they might license it.

Every page below follows from that.

---

## 2. Sitemap

```
/                          Home — the KAYAN story
│
├── /services              What we do (8 services)
│   └── /services/[slug]   Per-service detail
│         embroidery · printing · safety-vests · t-shirts
│         aprons · caps · restaurant-uniforms · corporate-uniforms
│
├── /products              Catalogue by category
│   └── /products/[slug]   Category detail + model gallery
│         t-shirts · aprons · shemagh · vest-turkish · vest-chinese
│
├── /journey               Manufacturing journey — raw material → delivery
│
├── /gallery               Full work gallery, filterable
│
├── /technology            ERP preview — how technology serves the order
│
├── /about                 About KAYAN
│
├── /contact               Enquiry / quote request
│
├── /login                 Portal selection  ← primary CTA
│   ├── /login/customer      Customer Portal
│   ├── /login/employee      Employee Portal
│   ├── /login/erp           ERP System
│   └── /login/admin         Admin
│
└── /legal
    ├── /legal/privacy
    └── /legal/terms
```

**14 routes + 2 dynamic segments.**

### 2.1 Removed

| Route | Why |
|---|---|
| `/platform` | Sold the ERP as a product. Replaced by `/technology`, which frames it as KAYAN's capability. |
| `/industries` | Addressed rival manufacturers as buyers. Replaced by `/products`. |
| `/company` | Written as a software company's engineering manifesto. Replaced by `/about`. |

All three contained the generic-SaaS content the directive removes.

### 2.2 Homepage sections — exactly the seven directed

| # | Section | Source of content |
|---|---|---|
| 1 | Hero | Brand identity |
| 2 | About KAYAN | **Needs client copy** |
| 3 | Our Services | The 8 directed services |
| 4 | Products | Drive — 5 categories |
| 5 | Manufacturing Journey | Written from the 8 services |
| 6 | Gallery | Drive imagery |
| 7 | ERP Preview | Existing `CostSheetPreview` |
| 8 | Contact | Existing lead form |

Removed from the current homepage: the fabricated statistics block (`219 requirements`, `130 tables`, `16 articles`) and all ERP-vendor copy.

---

## 3. Login — routing into the existing ERP

Per directive: the primary CTA opens Login; **no second ERP is built.**

```
/login  ─┬─ Customer Portal ──► apps/portal      (Phase 7, not yet built)
         ├─ Employee Portal ──► apps/shopfloor   (Phase 5, not yet built)
         ├─ ERP System     ──► apps/web          (Phase 5, not yet built)
         └─ Admin          ──► apps/web /admin   (Phase 5, not yet built)
```

**[GAP] None of these four targets exists yet.** The ERP is documented through Phase 8 but implementation is at Phase 2 of the client's order (Brand → Marketing → Auth → Design System → ERP Dashboard). Authentication is Phase 3, the dashboard Phase 5.

The `/login` page is therefore built as the **real selection surface**, with each destination reading from one config map (`ERP_TARGETS`). When each app comes online, its URL is filled in — a one-line change per portal. Until then a portal shows an honest "coming soon" state rather than a broken link or a fake login form that accepts credentials and does nothing.

**This is the "connect every page to the existing ERP navigation" step.** It can be completed structurally now and wired for real at Phase 3.

---

## 4. Company assets — Drive verified

`https://drive.google.com/drive/folders/13AZAM3LyLlB1ta4O56XNQs1d3JfiAeOW`
Folder title: **صور التيشيرتات. شفقات. يلكات**

**Access confirmed — public, no sign-in required.** Structure is three levels: category → model → images.

| Category | Folder ID | Verified contents |
|---|---|---|
| المريلات — Aprons | `1TAG0GmZ7VhL6vLar11CSlzBPSwQ270_V` | not yet enumerated |
| تيشيرتات — T-shirts | `1AYakFI8nsj53I8BioqLuM2gIZi2anRr1` | 2 models; model 1 holds **12 PNGs** |
| شفقات — Shemagh | `1ThEX4sL7lsZ6DjfXUhbCtMG7gECTGm0R` | not yet enumerated |
| يلك تركي — Turkish vest | `18LhRQjpBs5dHjatoPEhQgLs5o_o5uz7n` | not yet enumerated |
| يلك صيني — Chinese vest | `10tv9QoG-uGEMYU2_X_uQ588_94bA2GqK` | not yet enumerated |

Download verified: one sample retrieved at 941×1672, 2.0 MB — a black polo with red collar and cuffs, studio-lit on a mannequin. Quality is good.

### 4.1 Harvest plan

1. Enumerate all model folders and file IDs via the browser (Drive lists files with JavaScript, so plain fetching cannot see them).
2. Download via `uc?export=download&id=…` — confirmed working on public files.
3. **Optimise before committing.** At ~2 MB each, the full set would run to hundreds of megabytes and destroy the LCP budget (NFR: < 2.5 s on 4G). Each image is resized to a max 1400 px long edge and converted to WebP, with a small blur placeholder.
4. Store under `apps/marketing/public/products/<category>/<model>/`.

### 4.2 Two observations to confirm

**Filenames.** Every file follows the pattern `file_00000000<hex>.png`, which is the export convention of a generative image tool rather than a camera. The images are good and I will use them as supplied — but if KAYAN has photographs of actual production, those would carry more weight with a procurement buyer than renders. Worth knowing which these are before the gallery is described as "our work".

**Coverage.** The Drive holds t-shirts, aprons, shemagh and two vest types — **four of the eight directed services.** There is no imagery for caps, restaurant uniforms, corporate uniforms, or for the embroidery and printing processes themselves.

---

## 5. Content still required from the client

Nothing below can be written without KAYAN's input, and inventing it is prohibited.

| # | Needed | Blocks |
|---|---|---|
| C-1 | **About KAYAN** — founding, years operating, facility, capacity, what makes you different | Homepage §2, `/about` |
| C-2 | **Product imagery for caps, restaurant uniforms, corporate uniforms** | `/services` detail, `/products` |
| C-3 | **Embroidery and printing process imagery** — machines, production floor | `/journey`, `/gallery` |
| C-4 | **Contact details** — address, phone, WhatsApp, email, working hours | `/contact`, footer |
| C-5 | **Legal entity name and address** | `/legal/*` — currently marked draft |
| C-6 | **Real client names or logos**, if any may be shown | Trust section (otherwise omitted) |
| C-7 | **Minimum order quantity, lead times, size ranges** | `/services/[slug]` |

**No statistic, testimonial, client name or capability claim will be written without a source.** The previous homepage figures were about the software project, not about KAYAN, and are being removed rather than reworded.

---

## 6. Colour Directive — one exception, stated

The directive: remove the yellow/green accent, use **#5C2535** as the primary accent everywhere.

Removal is done — no brass or hi-vis token remains in the codebase.

**The exception.** `#5C2535` on the dark background measures **≈1.9:1** contrast. WCAG 2.2 AA requires 4.5:1 for text, and NFR-06 commits this project to AA. Used literally as a text accent it would be both illegible and non-compliant.

Resolution — the same colour, applied the way the logo applies it:

| Use | Token | Contrast |
|---|---|---|
| Fills — buttons, chips, surfaces | `#5C2535` with white text | **9.5:1** ✓ |
| Text, rules, icons on dark | `--color-primary-400` (`#c46481`) | **≈5.6:1** ✓ |
| Light mode (invoices, PDF) | `#5C2535` directly on white | **9.5:1** ✓ |

Both are the brand hue at 342°. No third colour exists in the system.

**Recommendation.** The cleanest resolution is a **light theme** for the marketing site — cream/white ground with maroon type and maroon-filled CTAs, which is exactly the logo's own logic and reads far more "premium uniform brand" than the current dark industrial treatment. The dark theme was chosen for an ERP-vendor positioning that no longer applies. This is a design decision for you, not one I will make unilaterally.

---

## 7. Build Order

| Step | Work | Blocked? |
|---|---|---|
| 1 | Colour system → maroon only | **Done** |
| 2 | Sitemap (this document) | **Done** |
| 3 | Harvest + optimise Drive imagery | No |
| 4 | `/login` + `ERP_TARGETS` config | No |
| 5 | `/services` + 8 detail pages | Partly — C-7 |
| 6 | `/products` + category pages | No — Drive covers 5 |
| 7 | Homepage rebuild to the 7 directed sections | Partly — C-1 |
| 8 | `/journey`, `/gallery` | Partly — C-3 |
| 9 | `/technology` (ERP preview, reuses `CostSheetPreview`) | No |
| 10 | `/about`, `/contact` | Yes — C-1, C-4 |
| 11 | Delete `/platform`, `/industries`, `/company` | No |

Steps 3, 4, 6, 9 and 11 proceed immediately. The rest need the §5 content.

---

## 8. Change Log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-08-06 | Initial sitemap. Repositioned from ERP vendor to uniform manufacturer; 14 routes defined; login routing to existing ERP apps specified; Drive access verified with structure and IDs; 7 content gaps raised; colour contrast exception documented. |

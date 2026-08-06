# 07 — UI / UX Design

**Version:** 2.0
**Date:** 2026-08-05
**Status:** §2 APPROVED (ADR-015, client 2026-08-05) — §9 open questions remain
**Governed by:** [00_Constitution](00_Constitution.md) v1.0

---

## 1. Two Products, One Token Layer

The directive defines two experiences with opposed goals:

| | Marketing Website | ERP Platform |
|---|---|---|
| Purpose | Attract, impress, convert | Execute work, all day |
| Success measure | Awwwards-capable | Comfortable for 8+ hours |
| Session length | 2–4 minutes | 8+ hours |
| Sessions per user | Once or twice | Daily, for years |
| Motion | Cinematic, expressive | Subtle, functional |
| Information density | Low — one idea per screen | High — maximum legible density |
| Novelty | Every section surprises | **Nothing ever surprises** |
| Load budget | Generous, staged | Instant |

These are not two skins. They are two products.

---

## 2. Shared Tokens, Independent Components — APPROVED

**ADR-015 approved by client, 2026-08-05.** The two products share brand and tokens. **All UI components remain completely independent.**

### 2.1 Package structure (client-specified)

```
                   ┌──────────────────────────────┐
                   │   packages/brand             │  identity · colour · type
                   │   packages/motion            │  easing curves · durations
                   │   packages/icons             │  one icon family
                   │   packages/utils             │  pure helpers
                   └──────────────┬───────────────┘
                                  │  shared by both
              ┌───────────────────┴───────────────────┐
              ▼                                       ▼
   ┌────────────────────────┐            ┌────────────────────────┐
   │ packages/ui-market     │            │ packages/ui-erp        │
   │ cinematic · R3F · GSAP │            │ shadcn/ui · dense      │
   │ scroll choreography    │            │ fast · quiet           │
   └────────────────────────┘            └────────────────────────┘
                                                     ▲
                                         ┌───────────┴───────────┐
                                         │ packages/charts       │
                                         │ data viz — ERP-first  │
                                         └───────────────────────┘
```

| Package | Contents | Consumers |
|---|---|---|
| `brand` | Colour tokens, typography scale, spacing scale, radii, logo assets, voice & tone, **accessibility standards** | Both |
| `motion` | Easing curves, duration scales, reduced-motion primitives | Both |
| `icons` | Single icon family, RTL-aware directional variants | Both |
| `utils` | Framework-free helpers — formatting, dates, numerals, RTL detection | Both |
| `ui-market` | Cinematic components, R3F scenes, scroll choreography | `apps/marketing` only |
| `ui-erp` | shadcn/ui-based dense components, data grids, forms | `web`, `shopfloor`, `portal` |
| `charts` | Data visualisation | `ui-erp` primarily; marketing may use a token-styled subset |

**Binding rule:** `ui-market` carries the three.js / GSAP / R3F runtime. **No ERP app may import it** — lint-enforced (Architecture §21.1).

**Note on `charts`:** it serves two very different needs — a dense, instantly-readable ERP chart and an expressive marketing data scene. It is built ERP-first (density, accuracy, accessibility), with marketing consuming a token-styled subset. Marketing's most expressive data moments live in `ui-market`, not here, because they are scenes rather than charts.

**Note on `motion`:** it holds curves and durations, not animations. A shared `easeOutExpo` is brand. A shared scroll-jack component would violate the independence rule.

---

## 3. Workspace Recon — Reusable Assets

`recommend.ps1` scored `noir-parfum` at **1455 points** for this brief (against 120 for the ERP brief — this domain is genuinely covered). Verified present on disk: **33 components** in `D:\AI\luxury-ai-engineering\projects\noir-parfum\src\components\`.

### 3.1 Reuse — motion and 3D infrastructure

| Asset | Directive requirement it satisfies |
|---|---|
| `SmoothScroller.tsx` | Scroll-driven storytelling (Lenis) |
| `ScrollProgress.tsx` | Scroll-driven storytelling |
| `MagneticButton.tsx` | **Magnetic Buttons** — explicitly requested |
| `CountingNumber.tsx` | **Animated Numbers** — explicitly requested |
| `AnimatedText.tsx` | **Progressive Reveal** — explicitly requested |
| `Particles3D.tsx` | Ambient motion, particle fields |
| `CinematicIntro.tsx` | Intro gate pattern |
| `SectionWrapper.tsx` | Section reveal orchestration |
| `Bottle3D.tsx` | `<Canvas>` boundary + R3F patterns (pattern, not the model) |

Five items on your motion list already exist as working, catalogued code.

### 3.2 Do NOT reuse — visual identity

`noir-parfum` is a **luxury perfume storefront**: black-and-gold, serif, romantic. Wrong for a B2B industrial platform, and the directive requires a unique identity.

**Excluded:** `GoldDivider`, `FragrancePyramid`, `StarRating`, `CollectionCard`, the gold/black palette, and the serif type stack.

**The rule: inherit the machinery, not the mood.**

### 3.3 Skills to apply

`nextjs-r3f-luxury` · `webgl-scroll-choreography` (Lenis, ScrollTrigger, scroll-driven camera) · `webgl-a11y` · `3d-asset-pipeline` (Draco/KTX2) · `design-system` · `ui-ux-pro-max`

### 3.4 Inherited gaps — stated, not silent

**[GAP]** `noir-parfum` ships **120 files, 39 components, 0 tests**. Reusing its components does not import its testing gap — reused assets get tests here.
**[GAP]** No deployment configuration exists anywhere in `D:\AI` — **0 Dockerfiles measured**. No hosting target is inherited.
**[GAP]** No project-level CI exists in the reference workspace.

---

## 4. Marketing Website

### 4.1 Design language

Not perfume-luxury. Not generic SaaS. The identity should read as **industrial precision** — the aesthetic of a well-run factory floor and a clean spreadsheet, made beautiful.

| Element | Direction |
|---|---|
| Palette | Deep neutral base; one confident accent; material-derived secondaries (ink, thread, hi-vis) |
| Type | Geometric or grotesque sans with strong Arabic counterpart. **No serif.** |
| Form | Precise geometry, real grids, engineered feel — not soft/organic |
| Texture | Substrate and weave surfaces used sparingly; the product is physical, the site should know it |
| Light | Directional, studio-like — printing and inspection are lit environments |

**Hi-vis yellow-green is available as an accent and should be used with restraint** — it is the single colour that says "safety products" without a word. Overused, it reads as a construction site.

### 4.2 Narrative architecture — the site is one story, not a list of sections

Per directive: **storytelling instead of sections.** No "About Us", no "Services", no "Products". The visitor discovers the company by travelling through the factory, and every scroll advances the story.

**The spine: one order's journey from raw material to delivered, certified product.** That single narrative thread is what makes 15 set pieces cohere instead of feeling like a showreel.

```
ACT I   — THE PROMISE       Hero · what this company makes possible
ACT II  — THE MAKING        raw material → print → embroidery → cut & sew → QC
ACT III — THE CONTROL       the ERP watching every step: orders, stock, finance
ACT IV  — THE INTELLIGENCE  AI reading the factory
ACT V   — THE PROOF         results, trust, invitation
```

### 4.3 WOW Moment matrix — 10 moments, 10 interaction grammars

The directive requires each WOW moment to have a **completely different interaction style**. Interaction grammar is the axis that guarantees it: no two moments share both the input the visitor gives and the response they get.

| # | Act | WOW Moment | Story it tells | **Interaction grammar** (each used once) | 3D |
|---|---|---|---|---|---|
| 1 | I | **Cinematic Hero** | What we make | **Autoplay + scroll-dolly** — visitor does nothing at first | ● |
| 2 | I | Platform Overview | One system, every department | **Free orbit** — visitor drags, camera obeys | ● |
| 3 | II | **Fabric Transformation** | Raw roll becomes garment | **Scroll-scrub** — scroll position *is* the timeline | ● |
| 4 | II | **Printing Simulation** | Ink meets substrate | **Pointer-as-tool** — cursor becomes the squeegee/print head | ● |
| 5 | II | **Embroidery Thread Animation** | 8,400 stitches, one design | **Path-draw on scroll** — stitch path renders progressively | ◐ |
| 6 | II | **Live Production Timeline** | An order moves through stages | **Horizontal pinned travel** — vertical scroll → lateral motion | — |
| 7 | III | **Warehouse Experience** | Where everything rests | **Camera-on-rails fly-through** — fixed path, no control | ● |
| 8 | III | **Supply Chain Visualization** | Goods and money in motion | **Hover-to-inspect** — still scene, nodes reveal on approach | ◐ |
| 9 | III | **Interactive Dashboard Preview** | The ERP itself | **Real UI, genuinely clickable** — a live component, not a video | — |
| 10 | IV | **AI Analytics Scene** | The system predicting | **Ambient + cursor-influenced field** — responds without being controlled | ● |

● full 3D · ◐ light 3D or 2D canvas · — DOM/SVG only

**Six full-3D moments, two light, two DOM.** The narrative alternates GPU load by design: Act II's heavy sequence is followed by the DOM-based Timeline and Dashboard, letting the GPU and the visitor breathe.

**#9 deserves emphasis.** A genuinely interactive ERP preview — built from real `ui-erp` components with real tokens — is more persuasive than any rendering, and it is the one moment where the two products meet. It proves the dashboard is fast by *being* fast.

### 4.4 Supporting beats

Between WOW moments, quieter passages carry the story and prevent fatigue:

| Beat | Treatment |
|---|---|
| Sticky Header | Full-bleed → condensed pill morph; magnetic nav |
| Quality Verification | Inspection-light sweep across a still product — restrained, precise |
| Statistics | Full-bleed typographic moment; `CountingNumber` on intersection |
| Customer Proof | Depth card stack, drag-to-advance **[OPEN-37 — real content required]** |
| FAQ | Height morph only — deliberate calm before the close |
| Premium CTA | `MagneticButton` over an ambient shader field |
| Footer | Oversized logotype, parallax reveal |

### 4.5 Progressive escalation

Motion must become **progressively more impressive**. Escalation is planned as a curve, not a ramp — continuous intensification exhausts a visitor before they reach the CTA.

```
intensity
   │                                        ╭──╮        ← #10 AI (peak)
   │              ╭──╮   ╭──╮      ╭──╮    ╱    ╲
   │        ╭──╮ ╱    ╲ ╱    ╲    ╱    ╲  ╱      ╲
   │  ╭──╮ ╱    ╳      ╳      ╲__╱      ╲╱        ╲___  ← CTA: calm, decisive
   │ ╱    ╳
   └──────────────────────────────────────────────────► scroll
     1  2   3   4    5    6     7    8    9    10   CTA
```

Each peak exceeds the last; each trough gives the eye somewhere to rest. **The CTA is deliberately the calmest moment on the page** — a visitor ready to convert should not be competing with a shader for attention.

### 4.6 The Hero's six-second job

The Hero must communicate **innovation, precision, manufacturing, technology, enterprise, and trust** before a visitor decides whether to keep scrolling.

Six abstract words cannot be stated. They must be demonstrated:

| Quality | How the Hero shows it |
|---|---|
| Manufacturing | The subject is unmistakably a physical product being made |
| Precision | Micro-detail held in sharp focus — stitch density, registration marks, thread tension |
| Technology | Data annotations track the physical object; the digital reads the real |
| Innovation | The assembly itself is something the visitor has not seen a website do |
| Enterprise | Restraint. Scale and calm, not noise. Consumer sites shout; enterprise sites don't. |
| Trust | Flawless execution and instant load. **A hero that stutters communicates the opposite of all six.** |

**Concept:** particles converge into a hi-vis safety garment — printed, embroidered, certified — while thin data annotations resolve alongside it, as though the ERP is watching the object come into being. Physical and digital assemble in the same shot, which is the company's actual proposition expressed as one image.

### 4.3 3D architecture

Per the `3d-websites` playbook — the `<Canvas>` boundary is the architectural seam.

**One persistent `<Canvas>`, fixed-position, with scene content swapped by scroll position.** Not one Canvas per section: browsers cap concurrent WebGL contexts (~8–16), and each context carries real allocation cost.

Playbook rules, all binding:

- Never mount `<Canvas>` in the root layout — the ERP must never pay for three.js
- Mount behind an intersection check or intro gate
- Draco for geometry, KTX2 for textures
- `dpr={[1, 2]}` capped — uncapped retina doubles fragment cost for no visible gain
- Instance repeated geometry (§4.2 #6 depends on this)
- Never animate via `useState` inside `useFrame` — mutate refs
- `"use client"` on every component calling an R3F hook

**Every 3D scene must explain the platform** (directive). Each of the five earns its place by showing a real mechanism: assembly, system topology, production sequence, stock movement, inference.

---

## 5. ERP Platform UI

### 5.1 The 8-hour standard

The dashboard's success measure is that **nothing about it is memorable.** A user should finish a shift without having noticed the interface at all.

| Principle | Implementation |
|---|---|
| Density first | Compact row heights, tight but legible spacing; a data grid shows ~30 rows without scrolling |
| Keyboard first | Every frequent action reachable without a mouse; command palette; tab order that matches work order |
| Instant feedback | Optimistic UI where safe; skeletons only over 200 ms; **never a spinner on a keystroke** |
| Predictable | Identical layout grammar across all 18 modules. Learn one screen, know them all. |
| Low fatigue | Reduced contrast ratios *within* AA, no pure-white backgrounds, dark mode as a peer not an afterthought |
| Errors are recoverable | Inline validation, undo where possible, never a dead-end dialog |

### 5.2 Motion inside the ERP

Permitted, because functional: state transitions (~150 ms), list insert/remove, drawer and modal entry, progress indication, focus movement.

**Prohibited:** parallax, scroll-jacking, decorative 3D, entrance animations on data, magnetic cursors, anything that delays interaction. **If an animation makes a task slower, it is a defect.**

### 5.3 Shop-floor terminal

Per NFR-05, a distinct surface: oversized touch targets, glove-operable, minimal typing, barcode-driven, high contrast for variable factory lighting, and legible at arm's length.

### 5.4 Density and drill-down

Constitution Article 13 requires drill-down everywhere, and Article 5 requires every cost to explain itself. The **Cost Sheet derivation tree** (Architecture §7.2) is the most demanding UI in the system: a deep, expandable tree where each node shows label, formula version, inputs with sources, and output — legible without becoming a wall of numbers. It is prototyped early, not last.

---

## 6. Motion & Accessibility

NFR-06 commits the project to **WCAG 2.2 AA**, and the playbook names ignoring `prefers-reduced-motion` as a top-five mistake and a production gate.

| Requirement | Applies to |
|---|---|
| `prefers-reduced-motion` honoured — every cinematic effect has a static or minimal-motion equivalent | Both |
| Reduced-motion path is designed, not degraded — the site must still be *good* without motion | Marketing |
| 3D scenes carry text alternatives and are never the sole carrier of information | Marketing |
| Full keyboard operability including scroll-jacked and pinned sections | Both |
| No scroll-jacking that traps a keyboard user | Marketing |
| Focus visible at AA contrast against every background including 3D | Both |
| No information conveyed by colour alone | Both |
| Motion never triggers vestibular discomfort — no large-field rapid parallax | Marketing |

**A cinematic site that fails reduced-motion is not award-winning; it is inaccessible.** Awwwards juries assess accessibility. These constraints raise the ceiling rather than lowering it.

---

## 7. Arabic & RTL

NFR-01/02 require full Arabic with RTL mirroring. **The marketing site is harder than the dashboard here, and this is routinely overlooked.**

| Concern | Requirement |
|---|---|
| Layout | CSS logical properties throughout — lint-enforced (ADR-011) |
| **Scroll choreography** | Horizontal scroll (§4.2 #4) must travel **right-to-left** in Arabic |
| **3D camera paths** | Directional camera travel (§4.2 #5) mirrors on the X axis |
| **Parallax direction** | Horizontal parallax mirrors; vertical does not |
| Text reveals | Character/word reveals originate from the correct edge |
| Typography | Arabic display face with genuine weight range — most lack one, and this constrains the type choice |
| Numerals | Configurable Arabic-Indic vs Western |
| Testing | RTL visual regression from day one, both products |

**[OPEN-34]** Is the marketing site bilingual at launch, or English-first with Arabic following? This materially affects the type selection and the scroll choreography work.

---

## 8. Performance Budgets

### Marketing site

| Metric | Budget | Why |
|---|---|---|
| LCP | < 2.5 s on 4G mid-tier mobile | Core Web Vitals gate organic search — the lead pipeline depends on it |
| Initial JS (before 3D) | < 200 KB gzipped | 3D loads on demand, never in the critical path |
| CLS | < 0.1 | — |
| INP | < 200 ms | Scroll-driven work must not block input |
| 3D scenes | Lazy, intersection-gated, Draco + KTX2 | Playbook |
| Mobile 3D | Reduced scene complexity or static fallback below a device threshold | Mid-range Android is the real constraint |

**The tension, stated plainly:** Awwwards-grade 3D and top-decile Core Web Vitals pull against each other. The resolution is staging — a fast, complete first paint, with cinematic weight loading behind it. A visitor must never wait on a WebGL bundle to read the value proposition.

### 8.1 Client performance rules — binding

| Rule | Implementation |
|---|---|
| **Maximum Lighthouse performance** | Budgeted per route; enforced in CI, not measured after the fact |
| **One persistent WebGL Canvas** | Fixed-position, mounted once behind an intersection gate; scene content swaps by scroll position. Never one Canvas per section — browsers cap contexts at ~8–16. |
| **Dynamic scene loading** | Each of the six 3D moments is a separate dynamic import, fetched on approach, disposed on exit |
| **Asset streaming** | Draco geometry and KTX2 textures streamed progressively; a low-detail proxy renders while full detail arrives |
| **GPU optimisation** | Instanced geometry; `dpr` capped at `[1, 2]`; refs mutated in `useFrame`, never state; frustum culling; postprocessing budgeted per scene |
| **Graceful degradation** | Device capability probed at load. Below threshold: reduced scene complexity, then static art direction. **The story must survive with zero WebGL.** |

**The degradation ladder — four rungs, each a complete experience:**

```
FULL       modern desktop GPU        all 6 scenes, postprocessing
REDUCED    mid-tier mobile           simplified geometry, no postprocessing
MINIMAL    low-end / weak GPU        2D canvas + video posters
STATIC     no WebGL / reduced-motion  art-directed stills, full narrative intact
```

The STATIC rung is not a failure state. It is the `prefers-reduced-motion` path (§6) and the crawler path, and it must stand on its own as a well-designed site — because a meaningful share of visitors will only ever see it.

### ERP

Per NFR-07/08/09: list views p95 < 500 ms at 100k rows; cost calculation p95 < 300 ms; dashboard p95 < 2 s. Virtualised grids; no route ships three.js.

---

## 9. Scope Impact & Open Questions

### 9.1 The marketing site is a new deliverable

It is **not** in SRS v1.1's 18 modules. It adds:

| Addition | Detail |
|---|---|
| `apps/marketing` | New Next.js app in the monorepo |
| `packages/ui-market` | Cinematic component layer |
| `packages/brand` | Shared token foundation (§2) |
| **Public lead-intake API** | Marketing forms must create CRM leads (FR-CRM-001) |
| 3D asset production | Modelling, optimisation, and art direction — a real workstream with its own cost |

### 9.2 Security note — public intake is an attack surface

A public site writing into the ERP is the only unauthenticated write path in the entire system. It must be a **dedicated, rate-limited, validated intake endpoint** creating unqualified leads only — never a general ERP API, never direct database access, never able to touch any other entity. Detailed in [03_System_Architecture](03_System_Architecture.md) §22.

### 9.3 Open questions

| ID | Pri | Question |
|---|---|---|
| **OPEN-35** | **B** | **What is the company name?** Directive resolves the identity question (create one if absent — §10), but B-1 Logo System cannot start without a name. Everything else in §10 can. |
| OPEN-34 | H | Marketing site bilingual at launch, or English-first? |
| OPEN-36 | H | Who produces 3D assets — commissioned, licensed, or procedurally generated in-code? Five scenes is a substantial art budget. |
| OPEN-37 | H | Is real customer content available for §4.2 #10 and #12? **Fabricated testimonials will not be written.** Placeholders stay visibly placeholder until real content exists. |
| OPEN-38 | N | Marketing site hosting target? No deployment config exists in the workspace (§3.4). |
| OPEN-39 | N | Does the marketing site ship before the ERP? It can — it has no ERP dependency beyond lead intake. |

**OPEN-35 blocks meaningful design work.** Everything in §4.1 is direction, not identity; identity cannot be invented without your input on the brand.

---

## 10. Brand Identity Workstream

Client directive: *"If no brand identity exists, create one before implementation."*

**[OPEN-35 remains partially open.** The instruction covers both cases, so the workstream is defined here regardless — but **the company name is still unknown to me**, and a logo system cannot be designed without it. Everything else can proceed.**]**

### 10.1 Deliverables

| # | Deliverable | Contents | Blocked by |
|---|---|---|---|
| B-1 | **Logo System** | Primary, horizontal, stacked, monogram, monochrome; clear-space and minimum-size rules; **Arabic logotype as a designed peer, not a transliteration** | **Company name** |
| B-2 | **Colour System** | Base neutrals, primary accent, material-derived secondaries (ink, thread, hi-vis), semantic colours; **every pair AA-verified in light and dark** | — |
| B-3 | **Typography** | Latin + Arabic families with genuine matched weight ranges; type scale; RTL metrics | — |
| B-4 | **Iconography** | One family, single grid and stroke weight; directional icons with RTL variants | — |
| B-5 | **Illustration Style** | Technical-diagrammatic register that can explain a BOM or a production flow | — |
| B-6 | **Photography Style** | Direction for factory, product, and people photography; lighting and grade | Asset source |
| B-7 | **Motion Language** | Easing curves, duration scale, choreography principles → ships as `packages/motion` | — |
| B-8 | **Voice & Tone** | English and Arabic, with a written rule for how the two registers differ | — |
| B-9 | **Brand Guidelines** | The above assembled, with usage rules and violations |

### 10.2 Two constraints that shape every choice

**Arabic is a first-class design problem, not a translation step.** Most Latin display families have no Arabic counterpart with matched weights, and most Arabic families have a narrow weight range. This constrains B-3 more than any aesthetic preference, and it must be resolved *before* the type scale is fixed — retrofitting Arabic into a Latin-derived scale produces the mismatched, undersized Arabic that makes bilingual sites look unfinished.

**The identity serves two opposed products.** The colour system must survive a cinematic hero at full saturation *and* an eight-hour data grid at low fatigue. In practice: a rich expressive range for `ui-market`, a restrained accessible subset for `ui-erp`, both drawn from one palette. Accessibility standards live in `packages/brand` (client-specified) precisely so the constrained product cannot be forgotten while designing the expressive one.

### 10.3 Sequence

```
Company name  →  B-1 Logo
                    ↓
B-2 Colour · B-3 Type · B-4 Icons  →  B-7 Motion  →  packages/brand
                    ↓                                packages/motion
B-5 Illustration · B-6 Photography · B-8 Voice  →  B-9 Guidelines
```

B-2, B-3, B-4, B-7, and B-8 can begin immediately. Only B-1 is name-blocked.

---

## 11. Sequencing Recommendation

The marketing site has **one** dependency on the ERP: lead intake. It can therefore ship independently and early — which is commercially useful, since it can generate leads while the platform is still being built.

Proposed: brand identity → marketing site → ERP phases continue in parallel, sharing only `packages/brand`.

---

## 10.5 Site Information Architecture

Added for Milestone 2. The site must discharge six responsibilities; each maps to a definite place rather than being spread thinly across a single page.

| Responsibility | Where it lives |
|---|---|
| Brand awareness | `/` — the five-act narrative |
| Product showcase | `/platform`, `/industries` |
| Demonstrating ERP capabilities | `/platform` — interactive dashboard preview |
| Company presentation | `/company` |
| Lead generation | `/contact` + CTAs throughout |
| Customer conversion | `/contact` — the demo request form |

### 10.5.1 Route map

```
/                     Homepage — cinematic narrative
/platform             The system: modules, capabilities, dashboard preview
/industries           The four archetypes as markets
/company              Story, approach, principles
/contact              Demo request — the conversion surface
/legal/privacy        Required for lead capture
/legal/terms
```

Deliberately **not** built: a `/resources` or `/blog` section, and a `/customers` page. Both need real content that does not exist; shipping them empty or fabricated would damage the credibility the rest of the site is built to earn. Tracked as OPEN-37.

### 10.5.2 The homepage and the inner pages obey different rules

This clarifies, and slightly narrows, the "never repeat animations" directive.

**Novelty is a homepage property.** A visitor sees the homepage once, is being persuaded, and rewards surprise. That is why §4.3 assigns ten distinct interaction grammars.

**Consistency is an inner-page property.** A visitor reaching `/platform` has already been persuaded and is now evaluating. They will visit several pages in one session, and a different interaction grammar on each would read as incoherence, not craft — while also multiplying load cost across exactly the pages where a buyer is comparing.

Inner pages therefore share **one** learnable grammar: a common page hero, `SectionShell` rhythm, and restrained entrance motion. **No WebGL on inner pages except the dashboard preview**, which earns it by being the product itself.

This is not a retreat from the cinematic standard. It is the standard applied correctly: the homepage sells, the inner pages inform, and confusing the two is how premium sites become exhausting.

### 10.5.3 Dashboard preview — scope boundary

WOW #9 should ultimately be built from real `@erp/ui-erp` components (§4.3). `ui-erp` does not exist yet: the ERP design system is a Phase 4 deliverable with its own documentation gate, and inventing three ad-hoc components now would prejudge it and violate D-14.

**Milestone 2 therefore builds the preview inside `apps/marketing` using `@erp/brand` tokens only.** When `ui-erp` lands, the preview switches to consuming it — a contained change, and at that point it becomes the genuine proof it is meant to be.

---

## 11.1 Implementation Status — Milestone 1

Built and verified in the browser on 2026-08-05.

| Deliverable | Status |
|---|---|
| Monorepo + Turborepo | Done (ADR-016) |
| `packages/brand` · `motion` · `utils` · `ui-market` | Done |
| `packages/icons` · `charts` · `ui-erp` | Not started — no consumer yet |
| Global layout, skip-link, fonts (Latin + Arabic) | Done |
| Navigation — morphing pill, mobile menu | Done |
| WOW #1 Cinematic Hero + weave scene | Done |
| Motion system — curves, reduced-motion, primitives | Done |
| Single persistent Canvas + dynamic scene loading | Done |
| Scroll storytelling — Lenis, progress, scene anchors | Done |
| Act II *The Making* — horizontal pinned travel | Done |
| Act III *The Control* — staggered ledger reveal | Done |
| Act V *The Proof* — counting figures | Done |
| WOW #2–#10 | **Milestone 2** |

**Verified:** production build passes with clean types · First Load JS **172 kB** (budget <200 kB) · no console errors · no horizontal overflow at 375 / 768 / 1280 · WebGL2 confirmed on GPU · `reduced` tier caps dpr at 1.5 on a 2× device.

### Defects found and fixed during verification

| Defect | Root cause |
|---|---|
| Headings rendered at 16px | `text-[length:--var]` is Tailwind v3 syntax, silently dropped by v4 |
| Accent colour invisible everywhere | `bg-[--var]` emitted unwrapped `background-color: --var` |
| Hero was a white blob | Point size ~78px with additive blending; weave spacing is only ~11.5px on screen |
| Hero assembled backwards | Progress mapped so it started assembled and scattered on scroll |
| One stat tile stuck at 0 | **`margin: '-15%'` shrinks the IntersectionObserver root on all four sides.** The leftmost tile sat outside the horizontal band, so `inView` never fired. Systemic — affected 4 components. |
| First Load JS 398 kB | `CanvasHost` in the barrel pulled three.js into the initial bundle |

---

## 12. Change Log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-08-05 | Initial UI/UX design. Two-product model with shared token layer (§2, correction proposed); recon identifies 9 reusable assets and excludes the perfume identity; 15 distinct section treatments; motion, accessibility, RTL, and performance budgets defined; 6 open questions raised, OPEN-35 blocking. |
| 2.0 | 2026-08-05 | ADR-015 approved. §2 rewritten as the client's 7-package structure. §4.2 reframed from sections to a five-act narrative; §4.3 WOW Moment matrix — 10 moments, 10 distinct interaction grammars; §4.5 escalation curve; §4.6 Hero's six qualities. §8.1 binding performance rules and the four-rung degradation ladder. §10 Brand Identity workstream, B-1…B-9. OPEN-35 narrowed to the company name. |

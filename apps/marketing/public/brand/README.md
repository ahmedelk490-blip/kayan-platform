# KAYAN logo assets — drop files here

The site reads the official logo from this folder. **The files are the source
of truth: the logo is never redrawn in code.**

## Required files

| File | What it is | Notes |
|---|---|---|
| `kayan-logo.png` | Full lockup — tag icon + كيان + KAYAN | Used in navbar, footer, intro, invoices, PDF |
| `kayan-mark.png` | Compact mark for small sizes | Optional; falls back to the full lockup |
| `favicon.ico` | Browser tab icon | 32×32 and 16×16 |
| `apple-touch-icon.png` | Mobile home screen | 180×180 |
| `icon-512.png` | PWA / app icon | 512×512 |

## Format guidance

- **PNG with transparency** preferred over a baked maroon square, so the logo
  can sit on any surface. If only the square version exists, supply it as
  `kayan-logo.png` and it will be used as-is.
- **SVG is better still** if the original vector exists — it stays sharp at
  every size and in print. Name it `kayan-logo.svg` and tell me; I will switch
  the reference.
- Export at **at least 3× the largest rendered size** (the intro renders it
  around 320px tall, so ≥960px).

## Usage rules enforced in code

- `<Logo />` sets `width: auto` and scales by height only — the aspect ratio
  cannot be broken by a caller.
- Minimum rendered width: **88px** (below this the Arabic wordmark breaks up).
- Clear space: **0.35 × the rendered height** on every side.
- Never stretched, recoloured, rotated, or reconstructed.

## Until the files arrive

`<Logo />` falls back to the word `KAYAN` set in the brand typeface. That is
plain text, deliberately **not** a reconstruction of the mark — so nothing on
screen can be mistaken for the real logo.

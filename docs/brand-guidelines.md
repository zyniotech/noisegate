# NoiseGate Brand Guidelines v1.0

> Last updated: 2026-11-23
> Status: Approved

## Quick Reference

| Element | Value |
|---------|-------|
| Primary Color | #F8FAFC |
| Secondary Color | #38BDF8 |
| Primary Font | Inter |
| Voice | Quiet, Precise, Neutral, Transparent |

---

## 1. Color Palette

NoiseGate uses an **Ultramono Titanium** palette inspired by precision optical hardware and studio audio gear. Chrome, surfaces, controls, and active tabs stay monochrome titanium, slate, and crisp white. Color appears exclusively as **semantic signal** (category labels, dimming, hiding, trust overrides, and official YouTube disclosures).

### Primary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Signal White | #F8FAFC | rgb(248,250,252) | Primary buttons, active tab underlines, signal waveform, headings |
| Platinum | #CBD5E1 | rgb(203,213,225) | Hover states, secondary emphasis, brushed highlights |

### Secondary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Optical Sapphire | #38BDF8 | rgb(56,189,248) | Lens refraction accent, official YouTube synthetic disclosure indicator |
| Deep Sapphire | #0E1C33 | rgb(14,28,51) | Optical glass depth inside the J1 brand mark |

### Neutral Palette

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Background | #0A0C10 | rgb(10,12,16) | Primary app canvas (Popup & Options) |
| Surface | #11141B | rgb(17,20,27) | Elevated panels, settings containers, list rows |
| Surface Subtle | #171B24 | rgb(23,27,36) | Inputs, secondary buttons, hover fills |
| Text Primary | #F3F4F6 | rgb(243,244,246) | Primary copy, channel names, metrics |
| Text Secondary | #94A3B8 | rgb(148,163,184) | Descriptions, metadata, timestamps |
| Text Muted | #64748B | rgb(100,116,139) | Section labels, monospace IDs, subtle hints |
| Border | #232936 | rgb(35,41,54) | 1px hairline borders and dividers |

### Semantic Colors

Color is reserved strictly for filter outcomes and channel signals:

| State | Hex | Usage |
|-------|-----|-------|
| Success | #10B981 | Trust (Allow) local overrides, verified independent creators, active status |
| Warning | #D97706 | AI / Synthetic channel labels, caution notices |
| Dim Accent | #EA580C | Synthetic mass uploads, dimmed card accent bar |
| Error | #EF4444 | Hidden channels, destructive actions, list fetch errors |
| Info | #38BDF8 | Official YouTube "Altered or synthetic content" disclosures |

### Accessibility

- Primary text (`#F3F4F6`) on Background (`#0A0C10`): >17:1 contrast ratio (AAA).
- Secondary text (`#94A3B8`) on Surface (`#11141B`): >7.0:1 contrast ratio (AAA).
- Signal White buttons (`#F8FAFC`) with Obsidian text (`#0A0C10`): >18:1 contrast ratio (AAA).
- All interactive states use distinct border, icon weight, and text contrast, never relying on color alone.

---

## 2. Typography

### Font Stack

```css
--font-heading: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
```

### Type Scale

| Element | Size (Desktop) | Size (Mobile) | Weight | Line Height |
|---------|----------------|---------------|--------|-------------|
| H1 | 32px | 24px | 600 | 1.15 |
| H2 | 18px | 16px | 600 | 1.25 |
| H3 | 14px | 14px | 600 | 1.35 |
| Body | 13px | 13px | 400 | 1.5 |
| Small | 12px | 12px | 400 | 1.4 |
| Caption / Mono | 11px | 11px | 500 | 1.35 |

### Typographic Rules

- Use `font-variant-numeric: tabular-nums` on every counter, entry count, and telemetry column.
- Render canonical YouTube channel IDs (`UC...`), `@handles`, format identifiers (`JSON v2`, `JSON v1`, `Plain-Text`), and URLs in `--font-mono`.
- Avoid pill badges (`rounded-full` filled chips). Communicate status using a 2-3px left accent stripe, a crisp Phosphor icon (`regular` default, `fill` for active states), and plain typography.

---

## 3. Logo Usage

The official NoiseGate mark is **J1 - Pure Signal Wave**: an anodized titanium octagon framing a recessed sapphire optical lens, divided by a machined gate shutter that stops jittery noise on the left and lets a pure luminous signal wave pass through on the right.

### Variants

| Variant | File | Use Case |
|---------|------|----------|
| Master Mark (Transparent) | `brand/logo-icon.svg` | Web headers, light/dark embeds, 48px-512px icons |
| Master Mark (Gunmetal Card) | `brand/logo-icon-card.svg` | Store tiles, avatars, square profiles |
| Monochrome Mark | `brand/logo-mono.svg` | Single-color print, small UI chrome, watermarks |
| Horizontal Lockup | `brand/logo-horizontal.svg` | README header, documentation, press kit |
| Extension Icons | `public/icon/{16,32,48,128}.png` | Chrome, Edge, and Firefox browser toolbars |
| Store & Social Banners | `brand/icon-512.png`, `brand/banner-1280x640.png`, `brand/promo-440x280.png` | GitHub social preview, Chrome Web Store, AMO |

### Clear Space

Maintain a minimum clear space equal to 20% of the octagon width on all four sides.

### Minimum Size

| Context | Minimum Width |
|---------|---------------|
| Digital - Horizontal Lockup | 140px |
| Digital - Icon Mark | 16px (use optical-small variant for 16px-32px) |
| Print - Full Lockup | 30mm |

### Don'ts

- Do not add a status dot or notification badge onto the titanium bezel.
- Do not replace the pure signal waveform with a generic play triangle.
- Do not rotate, skew, stretch, or invert the gate direction (noise stays left, pure signal flows right).
- Do not apply neon drop-shadows or glossy rainbow gradients to the titanium housing.

---

## 4. Voice & Tone

### Brand Personality - Quiet Precision

| Trait | Description |
|-------|-------------|
| **Quiet** | Calm, restrained copy with zero hype and zero exclamation marks |
| **Precise** | Concrete mechanics, verifiable claims, exact terminology |
| **Neutral** | Descriptive tags and source links rather than personal accusations |
| **Transparent** | Explains what is filtered, why it matched, and how to override it |

### Voice Chart

| Trait | We Are | We Are Not |
|-------|--------|------------|
| Quiet | Composed, understated | Shouty, sensational |
| Precise | Specific, technical where helpful | Vague, buzzword-filled |
| Neutral | Factual, user-directed | Moralizing, defamatory |
| Transparent | Inspectable, reversible | Opaque, black-box |

### Tone by Context

| Context | Tone | Example |
|---------|------|---------|
| Store & README | Direct, factual, benefit-first | "Label, dim, or hide YouTube channels using official disclosures, local rules, and open lists." |
| In-Page Signal Line | Compact, scannable | "AI / Synthetic · AiSList Sample" |
| Error Messages | Calm, diagnostic, actionable | "HTTP 404 while fetching list URL. Check the raw file link and try again." |
| Confirmations | Brief, neutral | "Local rule saved. Overrides subscribed lists." |

### Prohibited Terms

| Avoid | Reason |
|-------|--------|
| Scammer / Liar / Fraud | Defamatory personal accusation; violates legal safety guardrails |
| AI Detector | Inaccurate; NoiseGate uses explicit disclosures and transparent lists |
| Revolutionary / Game-changer | Empty hype that weakens trust |
| Seamless / Robust / Unlock | Generic filler; name the actual behavior instead |

---

## 5. Iconography & UI Polish

- **Icon Library:** Official Phosphor Icons (`@phosphor-icons/react` in React surfaces; raw official SVGs from Phosphor v2.1.1 in YouTube in-page DOM). Base weight: `regular`; active toggle state: `fill`.
- **Zero Pill Badges:** Never render filled pill tags (`rounded-full px-2 py-0.5`). Use vertical 2-3px accent bars, crisp hairline borders, and typographic hierarchy.
- **Motion Discipline:** Fast ease-out (`cubic-bezier(0.23, 1, 0.32, 1)`, 140ms) for popovers only; `:active { transform: scale(0.97) }` tactile feedback on buttons; zero animation on frequent keyboard or feed-scan updates.

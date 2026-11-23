# Contributing to NoiseGate

Thanks for helping build **NoiseGate** — an open-source, strictly neutral YouTube filtering tool.

## Two-Repository Architecture

NoiseGate keeps the browser extension code separate from community list data:

- **`zyniotech/noisegate`** (this repo) — Browser extension source code (WXT, React, TypeScript, CSS tokens, tests).
- **[`zyniotech/noisegate-lists`](https://github.com/zyniotech/noisegate-lists)** — Open directory manifest (`registry.json`), neutral topic catalogs, and community filter lists.

If you want to suggest, correct, or remove a **YouTube channel entry**, please open an issue in **`zyniotech/noisegate-lists`** rather than this repository.

## Development Setup

Requirements: Node.js 20+ (tested on Node 22) and `npm`.

```bash
npm install
```

### Common Commands

- `npm run dev` — Launch Chrome MV3 development build with live reload.
- `npm run dev:firefox` — Launch Firefox MV3 development build.
- `npm run typecheck` — Run TypeScript type checking (`tsc --noEmit`).
- `npm test` — Run unit test suite (`vitest run`).
- `npm run build` — Build Chrome MV3 extension into `.output/chrome-mv3`.
- `npm run build:firefox` — Build Firefox MV3 extension into `.output/firefox-mv3`.

## Core Principles for Contributors

1. **Neutrality First** — NoiseGate exposes verifiable metadata and gives control to the user (`Pass | Label | Dim | Hide`). Never add derogatory copy, moral labels, or unverified channel inference (such as guessing monetization from ads).
2. **Design System Consistency** — Follow [docs/brand-guidelines.md](./docs/brand-guidelines.md): Ultramono-Titanium surface palette, JetBrains Mono for tabular numbers/badges, zero emojis in UI, and **Phosphor Icons** (`@phosphor-icons/react` or `src/lib/phosphor-svg.ts`).
3. **Verify Before PR** — Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run build:firefox` cleanly.

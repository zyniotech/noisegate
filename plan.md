# NoiseGate - Project Plan

## 1. Goal & Core Idea
Free, open-source browser extension (Manifest V3) that labels, dims, or hides YouTube channels and videos based on transparent, user-chosen filter lists and verifiable signals (official YouTube synthetic disclosures, content farms, source-backed context notes).

**Core Principle (uBlock Model):**
- The extension is a neutral, open-source client (MIT license).
- No central "truth authority" or personal shaming database.
- Users decide which curated filter lists to subscribe to and whether matching channels are **labeled**, **dimmed**, or **hidden** (with full local override including **Trust / Allow**).

---

## 2. Finalized Brand & Architecture

- **Brand Identity:** **NoiseGate** - J1 *Pure Signal Wave* (anodized titanium octagon + recessed sapphire optical lens + machined gate shutter + luminous signal wave, zero status dot, zero play icon).
- **Visual System:** Ultramono Titanium (`#0A0C10` canvas, `#11141B` surfaces, `#F8FAFC` signal white active states; color reserved exclusively for semantic filter states). Full spec in [docs/brand-guidelines.md](./docs/brand-guidelines.md).
- **Framework & Build:** TypeScript + **WXT** (single codebase targeting Chrome, Edge, and Firefox on Manifest V3).
- **UI Stack:**
  - **Popup & Options:** React + Tailwind CSS + `@phosphor-icons/react` (consistent weight, zero pill badges).
  - **In-Page YouTube Overlays:** Lightweight Vanilla TypeScript DOM + isolated Shadow DOM popover (zero React runtime overhead on YouTube feeds).
- **Permissions:** `storage`, `alarms`, `host_permissions` (`*://*.youtube.com/*`, `https://cdn.jsdelivr.net/*`, `https://raw.githubusercontent.com/*`) plus `optional_host_permissions` (`https://*/*` requested on demand for custom HTTPS list origins).
- **Channel Resolution (`UC...` + `@handle`):**
  - **MAIN-World Bridge (`youtube-bridge.content.ts`)**: Reads YouTube's internal Polymer / `ytInitialData` / `ytInitialPlayerResponse` objects directly on rendered cards and Watch pages to extract canonical `browseId` (`UC...`), `@handle`, channel name, video ID, and official synthetic-content disclosures with zero extra network requests.
  - **Local Handle Cache:** Persists `@handle -> UC...` mappings in `browser.storage.local` as instant fallback.
- **Data Storage & Batch Lookup:**
  - Background Service Worker fetches static filter lists periodically (`alarms`) and stores parsed entries in **IndexedDB** (`noisegate_cache`) with in-memory `O(1)` lookup maps by both `channelId` and normalized `@handle`.

---

## 3. Three-Layer Filtering & Conflict Resolution

1. **Layer 1: Official YouTube Signals (works at 0 users)**
   - Detects YouTube's official *"Altered or synthetic content"* disclosure on Watch pages (from internal player/watch data and multilingual DOM signals).
   - Displays a clean non-pill context bar on the Watch page and caches detected video IDs + channel disclosure counters locally so they stay visible in feeds.
2. **Layer 2: Local Personal Controls**
   - 1-click hover action on YouTube cards opens a compact Shadow DOM menu: **Label**, **Dim**, **Hide**, **Trust (Allow)**, or **Remove**.
   - Full local JSON export/import in Options.
3. **Layer 3: Subscribable Community Lists (Decentralized)**
   - Supports **NoiseGate JSON v1** (structured schema with `category`, `note`, `evidenceUrl`) and **Plain-Text / AiSList format** (`! Title:`, `@handle` / `UC...` per line).
   - Ships with a curated small test subset (25 entries) sampled from `Override92/AiSList` for immediate verification without forcing a large upstream list.

**Conflict Resolution Order:**
1. Local user rules **always win** over community lists (including **Trust / Allow** overrides).
2. Across multiple active community lists, the strictest configured action wins (`Hide > Dim > Label`), while all matching sources remain inspectable.
3. Layer 1 official disclosures act as an additive signal when no stricter rule applies.

---

## 4. Roadmap & Milestones

### Milestone 1 & 2: Full MVP + Subscribable Filter Lists + Brand System (Completed)
- [x] Finalize architecture, UX, and NoiseGate J1 Ultramono-Titanium brand identity.
- [x] Scaffold WXT + TypeScript + React + Tailwind MV3 project (`chrome` + `firefox`).
- [x] Implement MAIN-world YouTube bridge (`UC...` + `@handle` + official disclosure extraction) + handle cache.
- [x] Implement content script card evaluation, zero-pill Label/Dim/Hide rendering, Watch-page disclosure bar & caching, and 1-click Shadow DOM marking menu.
- [x] Implement schema v1 JSON + AiSList plain-text parser, conflict resolver, IndexedDB list cache, and Background Service Worker (`alarms` + manual refresh).
- [x] Build Ultramono-Titanium React Popup & Options UI with Phosphor Icons (zero pill badges), J1 brand mark, local rules management, filter list subscriptions, JSON import/export, and bundled 25-channel AiSList test sample.
- [x] Create complete brand kit (`docs/brand-guidelines.md`, `.agents/product-marketing.md`, `assets/design-tokens.*`, `brand/*`, `README.md`, `docs/store-listing.md`).
- [x] Write unit tests (schema, normalization, conflict resolution) and verify Chrome & Firefox MV3 builds.

### Milestone 3: Quality, Verification & Store Release
- [x] Narrow `host_permissions` to YouTube + built-in CDN/GitHub hosts with `optional_host_permissions` (`https://*/*`) and maintain `PRIVACY.md`.
- [x] Fix SPA telemetry isolation, infinite DOM/bridge rescan prevention, cross-world JSON bridge events, prototype-key guards, and WCAG AA contrast.
- [ ] Chrome Web Store & Firefox Add-ons submission (`v1.0.0`).

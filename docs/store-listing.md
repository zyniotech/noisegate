# NoiseGate - Browser Store Listings (Chrome Web Store & Firefox Add-ons)

---

## Short Description (Chrome Web Store - max 132 characters)

> Label, dim, or hide YouTube channels using neutral topic controls, official disclosures, local rules, and open filter lists.

---

## Full Store Description (Chrome Web Store & Firefox AMO)

**Neutral channel signals, topic controls, and transparent filter lists for YouTube.**

NoiseGate is a free, open-source browser extension that gives you direct control over YouTube Home, Search, Subscriptions, Channels, and Watch sidebars. Every signal stays strictly factual and inspectable, and all evaluation runs locally inside your browser.

### Core Capabilities

**1. Official YouTube Synthetic & Commercial Disclosures**
NoiseGate reads YouTube's official "Altered or synthetic content" disclosure on Watch pages, surfaces paid promotion disclosures per video, and shows public YouTube Partner Program features (`Memberships`, `Super Thanks`, `Super Chat`, `Shopping`) without ever guessing monetization from ads.

**2. Neutral Topic Controls**
Choose locally whether channels categorized under topics such as Science, Technology, Education, Gaming, Music, or Entertainment should `Pass`, `Label`, `Dim`, or `Hide` in your feed.

**3. One-Click Personal Rules (Always Highest Priority)**
Click any channel's corner button or Watch-page control to assign a local rule:
- **Label:** Subtle left accent line and source label beneath the channel name.
- **Dim:** Lowers card opacity until hover.
- **Hide:** Removes matching cards from view, with a live counter and temporary reveal toggle.
- **Trust:** Overrides every topic rule and subscribed filter list.

**4. Open Filter Lists (uBlock Client Model)**
Subscribe to any static HTTPS list in structured **JSON v2**, **JSON v1**, or **plain-text AiSList format**. Topic lists can run in metadata-only (`Pass`) mode feeding your topic matrix.

### Built for Speed and Privacy

- **Zero telemetry:** NoiseGate collects zero analytics, watch history, or device IDs.
- **Local O(1) lookup:** Lists cache inside browser IndexedDB and resolve cleanly inside the extension worker.
- **Portable configuration:** Export, import, or reset all local rules and settings anytime.

---

## Permission Justifications (For Store Review)

| Permission | Justification |
| :--- | :--- |
| `storage` | Persists local rules, settings, topic preferences, cached disclosures, and session tab counts on device. |
| `alarms` | Schedules periodic background refreshes (default every 24 hours) for user-subscribed filter lists. |
| `*://*.youtube.com/*` | Reads rendered YouTube cards and public Watch/Channel page disclosures locally in the browser. |
| `https://cdn.jsdelivr.net/*`, `https://raw.githubusercontent.com/*` | Fetches the default open community directory (`zyniotech/noisegate-lists`) and GitHub-hosted filter lists. |
| `optional_host_permissions: ["https://*/*"]` | Requested on demand only if a user subscribes to a custom third-party HTTPS filter list domain. |

---

## Store Assets Checklist

| Asset | File | Dimensions |
| :--- | :--- | :--- |
| Store Icon (512px) | `brand/icon-512.png` | 512 x 512 px |
| Small Promo Tile (CWS) | `brand/promo-440x280.png` | 440 x 280 px |
| Social / GitHub Preview | `brand/banner-1280x640.png` | 1280 x 640 px (resize/capture 1280 x 800 UI screenshots for CWS submission) |
| Extension Icons | `public/icon/{16,32,48,128}.png` | 16 / 32 / 48 / 128 px |

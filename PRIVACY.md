# Privacy Policy - NoiseGate

NoiseGate is designed with a **zero-telemetry, local-first architecture**. Your browsing behavior, watch history, channel overrides, and filter preferences never leave your browser.

## What NoiseGate Does NOT Collect

- No analytics, usage metrics, crash telemetry, or unique identifiers.
- No reporting of watched videos, visited channels, or observed monetization/topic signals back to any server or third party.
- No ads, affiliate links, or monetization inside the extension.

## Local Storage Only

All extension data stays strictly on your device across standard browser storage APIs:

- **`browser.storage.local`** - Persists your local channel rules (`Trust`, `Label`, `Dim`, `Hide`), topic rule matrix, monetization display preferences, subscribed list metadata, `@handle` -> `UC...` resolution cache (capped at 8,000 entries), observed synthetic disclosure video IDs (capped at 3,000 videos), and observed channel profile snapshots (`ng_channel_profiles`, capped at 5,000 channels) used exclusively to render factual UI metadata.
- **IndexedDB (`noisegate_cache`)** - Stores parsed entries from subscribed community filter lists for fast local `O(1)` lookup without bloating extension settings storage.
- **`browser.storage.session`** - Keeps transient active-tab card counts while your browser session is open so popup counters survive extension service worker idle restarts.

You can clear cached disclosure records under **Options -> YouTube Disclosures -> Clear Cache**, clear cached channel profiles under **Options -> Topics & Signals -> Clear Profiles Cache**, or reset all local extension data anytime under **Options -> Settings & Backup -> Reset Everything**.

## Network Requests

NoiseGate only initiates outbound **HTTPS** requests when:

1. Fetching the open community directory manifest (`registry.json`) from `cdn.jsdelivr.net` or `raw.githubusercontent.com` when opening or reloading the Community Directory.
2. Refreshing public filter lists (`https://`) that you have enabled or explicitly subscribed to (using HTTP conditional requests via `ETag` / `If-None-Match`).
3. Opening external submission/correction links in a new tab only when you explicitly click **Suggest metadata on GitHub** or **Request correction**.

## Browser Permissions Explained

- `storage` - Persist local rules, settings, topic matrix, caches, and session telemetry on-device.
- `alarms` - Schedule periodic background refreshes of enabled filter lists.
- `*://*.youtube.com/*` - Read public player/page disclosures (`microformat`, paid promotion, synthetic disclosure, public YPP partner and feature metadata) and apply your chosen `Label`, `Dim`, or `Hide` presentation locally.
- `https://cdn.jsdelivr.net/*`, `https://raw.githubusercontent.com/*` - Fetch the built-in open community directory (`zyniotech/noisegate-lists`) and open lists hosted on GitHub/jsDelivr.
- Optional `https://*/*` (`optional_host_permissions`) - Requested at runtime only if you manually subscribe to a custom third-party HTTPS filter list host.

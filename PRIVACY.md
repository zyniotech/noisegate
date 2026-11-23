# Privacy Policy — NoiseGate

NoiseGate is designed with a **zero-telemetry, local-first architecture**. Your browsing behavior, watch history, channel overrides, and filter preferences never leave your browser.

## What NoiseGate Does NOT Collect

- No analytics, usage metrics, crash telemetry, or unique identifiers.
- No reporting of watched videos, visited channels, or observed monetization/topic signals back to any server or third party.
- No ads, affiliate links, or monetization inside the extension.

## Local Storage Only

All extension data is stored locally in `browser.storage.local` inside your browser profile:

- Local channel rules (`Trust`, `Label`, `Dim`, `Hide`).
- Your topic rule matrix, monetization display settings, and appearance preferences.
- Locally observed channel metadata snapshots (`ng_channel_profiles`, up to a capped LRU window of recent channels) used solely for displaying factual telemetry in your own UI. You can clear all observed channel profiles anytime from **Options -> Topics & Signals -> Clear Observed Profiles** or reset everything from **Settings**.
- Cached filter lists fetched from URLs you choose to subscribe to.

## Network Requests

NoiseGate only initiates outbound network requests when:

1. Fetching the open community directory manifest (`registry.json`) from `cdn.jsdelivr.net` / `raw.githubusercontent.com` when you open or refresh the Community Directory.
2. Refreshing public filter lists (`https://*/*`) you have explicitly enabled or added by URL (using standard HTTP conditional caching via `ETag` / `If-None-Match`).
3. Opening external submission/correction links in a new tab only when you explicitly click **Suggest metadata on GitHub** or **Request correction / removal**.

## Browser Permissions Explained

- `storage` — Persist local rules, settings, topic matrix, and cached filter lists on-device.
- `alarms` — Schedule optional periodic refreshes of enabled filter lists in the background.
- `*://*.youtube.com/*` — Read public player/page disclosures (`microformat`, paid promotion, synthetic disclosure, public YPP surface buttons) and apply your chosen `Label`, `Dim`, or `Hide` presentation locally.
- `https://*/*` — Allow downloading user-configured HTTPS filter lists from custom sources you add.

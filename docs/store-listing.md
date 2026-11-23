# NoiseGate — Browser Store Listings (Chrome Web Store & Firefox Add-ons)

---

## Short Description (Chrome Web Store — max 132 characters)

> Label, dim, or hide YouTube channels using official synthetic disclosures, local rules, and open filter lists.

*(110 characters — clear, specific, compliant with YouTube trademark guidelines.)*

---

## Full Store Description (Chrome Web Store & Firefox AMO)

**See why a YouTube channel is flagged before you click.**

NoiseGate is a free, open-source browser extension that gives you direct control over YouTube Home, Search, Subscriptions, and Watch sidebars. Every match stays inspectable and reversible, and all lookups run locally inside your browser.

### Three Layers That Work Together

**1. Official YouTube Synthetic Disclosures**
YouTube places its "Altered or synthetic content" label inside the video description. NoiseGate detects that official disclosure on Watch pages, displays a clean bar under the title, and caches the signal locally so you recognize disclosed videos and channels across feeds.

**2. One-Click Personal Rules**
Hover any YouTube video card or click the Watch-page NoiseGate control to assign a local rule:
- **Label:** Adds a subtle left accent bar and single-line source note beneath the channel name.
- **Dim:** Lowers card opacity until you hover over it.
- **Hide:** Removes matching cards from view, with a live counter and a temporary "Reveal hidden" toggle in the popup.
- **Trust:** Overrides every subscribed filter list for a channel you want to keep clean.

**3. Subscribable Open Filter Lists**
NoiseGate separates the extension from community data, following the uBlock client model. Subscribe to any static HTTPS list in either structured **JSON v1** (with neutral category, note, and evidence link) or **plain-text AiSList format** (`@handle` and `UC...` entries). Choose per list whether matches are labeled, dimmed, or hidden.

### Built for Speed and Privacy

- **Zero watch-history tracking:** NoiseGate makes zero API calls per video and collects zero analytics.
- **Local O(1) lookup:** Subscribed lists sync periodically into IndexedDB and resolve in batches inside the background service worker.
- **Portable configuration:** Export and import your local rules, settings, and subscribed lists as plain JSON at any time.

---

## Permission Justifications (For Store Review)

| Permission | Justification |
| :--- | :--- |
| `storage` | Stores user preferences, local channel rules, `@handle -> UC...` resolution cache, and locally observed YouTube disclosure records on device. |
| `alarms` | Schedules periodic background refreshes (default every 24 hours) for user-subscribed static filter lists. |
| `*://*.youtube.com/*` | Reads rendered YouTube feed cards and Watch-page disclosure metadata to display channel indicators and apply local Label/Dim/Hide/Trust actions. |
| `https://*/*` | Fetches static HTTPS filter list files (JSON v1 or plain text) from URLs explicitly subscribed by the user (e.g., GitHub raw files, jsDelivr, or self-hosted lists). *(Note: Can be narrowed to `optional_host_permissions` prior to public store submission if stricter Chrome Web Store review is preferred.)* |

---

## Store Assets Checklist

| Asset | File | Dimensions |
| :--- | :--- | :--- |
| Store Icon (512px) | `brand/icon-512.png` | 512 × 512 px |
| Small Promo Tile (CWS) | `brand/promo-440x280.png` | 440 × 280 px |
| Hero / Social Banner | `brand/banner-1280x640.png` | 1280 × 640 px |
| Extension Icons | `public/icon/{16,32,48,128}.png` | 16 / 32 / 48 / 128 px |

---

## Suggested Store Screenshot Callouts

1. **Feed View:** Subtle left accent bar and single-line label beneath a matched channel on YouTube Search, keeping the page layout clean.
2. **One-Click Popover:** The isolated Shadow DOM channel menu showing source evidence and Label / Dim / Hide / Trust controls.
3. **Popup Telemetry:** Live page counters (Scanned / Labeled / Dimmed / Hidden) and the temporary "Reveal hidden" toggle.
4. **Filter Lists Manager:** Subscribing to JSON v1 and plain-text AiSList lists with per-list actions and one-click sync.
5. **Local Rules & Backup:** Managing Trust overrides and exporting personal settings as plain JSON.

# Contributing to NoiseGate Filter Lists

NoiseGate separates extension code from community filter data, following the uBlock client model. For curated public topic directories and Issue Forms, visit **[zyniotech/noisegate-lists](https://github.com/zyniotech/noisegate-lists)**.

## Supported Formats

### 1. NoiseGate JSON v2 (Two-Axis: Neutral Topics & Observable Signals)
```json
{
  "schemaVersion": 2,
  "listId": "open-channel-topics",
  "name": "Open Channel Directory - Neutral Topics & Signals",
  "description": "Source-backed channel topics and verifiable public disclosures.",
  "homepage": "https://github.com/zyniotech/noisegate-lists",
  "submissionUrl": "https://github.com/zyniotech/noisegate-lists/issues/new?template=channel-entry.yml",
  "removalUrl": "https://github.com/zyniotech/noisegate-lists/issues/new?template=correction.yml",
  "license": "CC0-1.0",
  "updatedAt": "2026-11-23T15:00:00Z",
  "channels": {
    "UCxxxxxxxxxxxxxxxxxxxxxx": {
      "topics": ["science", "education"],
      "signals": ["ypp-memberships"],
      "note": "Channel publishes mathematics explainer videos.",
      "evidenceUrl": "https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx"
    }
  },
  "handles": {
    "@ExampleHandle": {
      "topics": ["technology"],
      "note": "Optional handle fallback when canonical UC ID is unavailable.",
      "evidenceUrl": "https://www.youtube.com/@ExampleHandle"
    }
  }
}
```

### 2. NoiseGate JSON v1
Supports `category` (`ai-synthetic`, `synthetic-mass-upload`, `content-farm`, `reupload-compilation`, `verified-independent`, `disclosure-detected`, `paid-promotion`, `ypp-monetized`, `topic-match`, `custom`), `note`, and `https://` `evidenceUrl`.

### 3. Plain-Text Format (AiSList-Compatible)
- Header comment lines start with `!` (`! Title:`, `! Description:`, `! Homepage:`, `! License:`, `! Last Modified:`).
- One `UCxxxxxxxxxxxxxxxxxxxxxx` channel ID or `@handle` per line.

## Editorial Guardrails

1. **Prefer canonical `UC...` Channel IDs** over `@handle` where possible (handles can be renamed).
2. **Strict neutrality**: Record observable topics or factual disclosures only. Never include insults, speculation, or moral judgments.
3. **Provide verifiable HTTPS evidence**: Every JSON entry requires a direct `https://` `evidenceUrl` pointing to a public channel page, video disclosure, or primary source.
4. **Transparent corrections**: Open an issue in `zyniotech/noisegate-lists` anytime if channel metadata changes or an entry should be removed.

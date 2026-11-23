# Contributing to NoiseGate Filter Lists

NoiseGate follows the **uBlock model**: the browser extension is a neutral client, and filter lists are independent, inspectable files that users opt into.

## Supported Formats

### 1. NoiseGate JSON v1 (Recommended)
```json
{
  "schemaVersion": 1,
  "listId": "example-synthetic-channels",
  "name": "Example Synthetic Channels",
  "description": "Verifiable channels publishing primarily automated synthetic media.",
  "homepage": "https://example.org/lists",
  "updatedAt": "2026-11-23T00:00:00Z",
  "channels": {
    "UCxxxxxxxxxxxxxxxxxxxxxx": {
      "category": "synthetic-mass-upload",
      "note": "Automated TTS uploads with disclosed synthetic audio.",
      "evidenceUrl": "https://www.youtube.com/watch?v=..."
    }
  },
  "handles": {
    "@ExampleHandle": {
      "category": "ai-synthetic",
      "note": "Optional handle fallback when canonical UC ID is unavailable."
    }
  }
}
```

### 2. Plain-Text Format (AiSList-Compatible)
- Comment/header lines start with `!` (`! Title:`, `! Description:`, `! Homepage:`, `! Last Modified:`).
- One `UCxxxxxxxxxxxxxxxxxxxxxx` channel ID or `@handle` per line.

## Editorial Guardrails
1. **Prefer canonical `UC...` Channel IDs** over `@handle` where possible (handles can be renamed).
2. **Use neutral, descriptive categories only**: `ai-synthetic`, `synthetic-mass-upload`, `content-farm`, `reupload-compilation`, `verified-independent`. Never use defamatory or personal accusations.
3. **Provide verifiable evidence**: Every PR adding or modifying a channel in a structured JSON list should include a direct `evidenceUrl` (e.g., a video with synthetic disclosure or observable mass-upload pattern).
4. **Transparent removals**: Creators or contributors may open a removal PR/issue with counter-evidence if a channel was miscategorized or changed direction.

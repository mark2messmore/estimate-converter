# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Purchase Requisition Helper" (internal crate name `estimate-converter`) is a Windows desktop app that extracts line items from estimate/quote/invoice PDFs and images into Excel-pasteable rows using Claude. Two deployables:

1. **Tauri 2 desktop app** (Rust shell + WebView2 hosting an HTML/React frontend) — what end users install.
2. **Cloudflare Worker** (`worker/index.js`) — a thin proxy holding the Anthropic API key. Single endpoint `/api/extract` forwards to `api.anthropic.com/v1/messages`. The same Worker serves `www/` static assets, so the browser build and the API live at the same origin.

The desktop app holds no API keys — it calls the Worker by absolute URL. The Worker is the only place `ANTHROPIC_API_KEY` lives.

Live Worker: `https://purchase-req-helper.mark2messmore.workers.dev`

## Commands

```bash
npm run dev              # Tauri dev (recompiles Rust on change, hot-reloads www/)
npm run build            # Builds release exe + NSIS installer
npm run worker:dev       # `wrangler dev` — local Worker on http://127.0.0.1:8787
npm run worker:deploy    # Push Worker to Cloudflare
npm run worker:tail      # Stream live Worker logs
```

No test suite, no linter, no JS bundler. The frontend (`www/index.html`) is JSX transpiled in-browser via Babel-standalone.

## Architecture

### Worker (`worker/index.js`)
Single file, single endpoint:
- `POST /api/extract` → forward the request body straight to Anthropic's `/v1/messages` with the configured `ANTHROPIC_API_KEY`, return Anthropic's response unchanged.
- everything else → `env.ASSETS.fetch(request)` serves `www/`.

Model is hardcoded at the top as `MODEL`. To change models, edit the constant and `wrangler deploy`. There is no runtime config and no KV — the Worker is a CORS-and-key-injection layer with no response shaping. Anthropic's native response shape (`content: [{type: 'text', text}]`) is what the frontend already parses.

### Frontend (`www/index.html`)
Single self-contained HTML file. React 18, Tailwind, and Lucide loaded from CDNs; component tree inline as `<script type="text/babel">`. The same file is shipped to both Tauri (`build.frontendDist = "../www"`) and Cloudflare (`[assets] directory = "./www"`).

Tauri APIs are reached through `www/libs/tauri-utils.js` (re-export shim). The frontend feature-detects with `window.__TAURI__`:
- Tauri build → `API_ENDPOINT = <absolute workers.dev URL>` (hardcoded `PROD_API_URL`)
- Browser build → `API_ENDPOINT = '/api/extract'` (same-origin)

### Desktop shell (`src-tauri/`)
`src/main.rs` is tiny — just registers `updater`, `process`, `dialog`, `fs` plugins. No custom Rust commands; everything happens in the WebView. Release profile is aggressively size-optimised (`opt-level = "s"`, `lto`, `strip`) to keep the binary ~4.5 MB. `tauri.conf.json` wires the updater to a GitHub Releases `latest.json` URL and embeds the minisign public key. The matching private key is `update-keys.key` (gitignored).

## Cloudflare config

- `wrangler.toml` declares the `ASSETS` binding for static serving. No KV, no DO.
- The single secret is `ANTHROPIC_API_KEY`, set via `npx wrangler secret put ANTHROPIC_API_KEY`.
- Local dev reads the same name from `.dev.vars` (gitignored).
- No CI for Worker deploys; ship with `npm run worker:deploy` from a clean tree.

## Releases (desktop)

Canonical instructions live in `RELEASE-GUIDE.md`, which is **gitignored and local-only** because it embeds the signing password — present on the maintainer's machine, not in the public repo. Key invariants:

- **Version must be bumped in two places and they must match:** `src-tauri/tauri.conf.json` (`version`) and `www/index.html` (`APP_VERSION`). The auto-updater compares the served `latest.json` version against the running app's version from `tauri.conf.json`; `APP_VERSION` is only the user-visible string.
- **Sign AFTER the final build, and the signature in `latest.json` must match the exact bytes uploaded to GitHub Releases.** Rebuilding invalidates the signature.
- **GitHub tag is `vX.Y.Z`**; installer filename on the release uses dots-not-spaces (`Purchase.Requisition.Helper_X.Y.Z_x64-setup.exe`). The URL in `latest.json` must match exactly.
- Updater endpoint is hardcoded to `https://github.com/mark2messmore/estimate-converter/releases/latest/download/latest.json`, so `latest.json` MUST be a release asset every time.

If asked to do "a release" / "push an update", follow `RELEASE-GUIDE.md` step-by-step rather than improvising.

## Things easy to get wrong

- `dragDropEnabled: false` in `tauri.conf.json` is deliberate — the frontend implements its own drop handler.
- The Worker passes Anthropic's response through unchanged; the frontend reads Anthropic's native content shape directly. Don't add response normalization in the Worker.
- The Tauri build's hardcoded `PROD_API_URL` in `www/index.html` must match the deployed Worker URL before any release build. The browser path uses a relative URL so it's unaffected.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Purchase Requisition Helper" (internal name `estimate-converter`) is a Windows desktop app that extracts line items from estimate/quote/invoice PDFs and images into Excel-pasteable rows using Claude. The repo has two deployables:

1. **Tauri 2 desktop app** (Rust shell + WebView2 hosting an HTML/React frontend) — what end users install.
2. **Cloudflare Worker** (`worker/index.js`) — a thin proxy that holds the Anthropic API key and forwards `/api/extract` calls to `api.anthropic.com`. The same Worker serves the `www/` static assets, so the browser frontend and the API live at the same origin.

The desktop app does **not** ship the Anthropic key — it calls the Worker by absolute URL. The Worker is the only place the key lives.

Live worker: `https://purchase-req-helper.mark2messmore.workers.dev`

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
Single file, single endpoint. Routes:
- `POST /api/extract` → forward the request body straight to Anthropic's `/v1/messages`, return the response.
- everything else → `env.ASSETS.fetch(request)` serves `www/`.

The model is hardcoded at the top of the file (`MODEL`). To change models, edit the constant and `wrangler deploy`. There is no runtime config, no KV, no admin panel — earlier iterations had those and were removed for simplicity.

Anthropic's response format is what the frontend already parses (`result.content?.[0]?.text`), so the Worker is essentially a CORS-and-key-injection layer with no response shaping.

### Frontend (`www/index.html`)
A single self-contained HTML file. React 18, Tailwind, and Lucide are loaded from CDNs; the component tree is inline as `<script type="text/babel">`. Same file is shipped to both Tauri (`build.frontendDist = "../www"`) and Cloudflare (`[assets] directory = "./www"`).

Tauri APIs go through `www/libs/tauri-utils.js` (thin re-export shim). The frontend feature-detects with `window.__TAURI__`:
- Tauri build → `API_ENDPOINT = <absolute workers.dev URL>` (hardcoded `PROD_API_URL`).
- Browser build → `API_ENDPOINT = '/api/extract'` (same-origin, no CORS needed).

### Desktop shell (`src-tauri/`)
`src/main.rs` is tiny — just registers `updater`, `process`, `dialog`, `fs` plugins. No custom Rust commands; everything happens in the WebView. Release profile is aggressively size-optimised (`opt-level = "s"`, `lto`, `strip`) to keep the binary ~4.5 MB.

`tauri.conf.json` wires the updater to a single GitHub Releases URL (`latest.json` on the latest release) and embeds the minisign public key. The matching private key is `update-keys.key` (gitignored).

## Cloudflare config

- `wrangler.toml` declares the `ASSETS` binding for static serving. No KV, no DO.
- The single secret is `ANTHROPIC_API_KEY`, set via `npx wrangler secret put ANTHROPIC_API_KEY`.
- Local dev reads the same name from `.dev.vars` (gitignored — never commit real keys here).
- No CI for Worker deploys; ship with `npm run worker:deploy` from a clean tree.

## Releases (desktop)

The release process is brittle and order-dependent. Canonical instructions live in `RELEASE-GUIDE.md` (listed in `.gitignore` but currently committed — treat it as the source of truth, don't delete it without asking). Key invariants:

- **Version must be bumped in two places and they must match:** `src-tauri/tauri.conf.json` (`version`) and `www/index.html` (the `APP_VERSION` constant). The auto-updater compares the served `latest.json` version against the running app's version from `tauri.conf.json`; `APP_VERSION` is only the user-visible string.
- **Sign AFTER the final build, and the signature in `latest.json` must match the exact bytes uploaded to GitHub Releases.** Rebuilding invalidates the signature. Signing key is `update-keys.key`, password `update123` (yes, documented in `RELEASE-GUIDE.md`).
- **GitHub tag is `vX.Y.Z`**; installer filename on the release uses dots-not-spaces (`Estimate.Converter_X.Y.Z_x64-setup.exe`). The URL in `latest.json` must match exactly.
- Updater endpoint is hardcoded to `https://github.com/mark2messmore/estimate-converter/releases/latest/download/latest.json`, so `latest.json` MUST be a release asset every time.

If asked to do "a release"/"push an update", follow `RELEASE-GUIDE.md` step-by-step rather than improvising.

## Things easy to get wrong

- The currently-released desktop app (v1.1.5) was built against the old Vercel URL and **will not work** — Vercel is shut down. Users need v1.1.6+ which points at the workers.dev URL. Confirm `www/index.html` `PROD_API_URL` matches the deployed Worker before any release build.
- `dragDropEnabled: false` in `tauri.conf.json` is deliberate — the frontend implements its own drop handler.
- `code-signing.pfx` and `update-keys.key` may exist in working copies but are gitignored — don't add them in new commits, don't paste their contents into chat/PRs.
- The `public/` directory referenced in the (stale) README does not exist. The frontend is in `www/` only.
- Anthropic's image/document content format is what the frontend sends and the Worker forwards verbatim — don't introduce response normalization in the Worker; the frontend reads Anthropic's native shape directly.

# Purchase Requisition Helper

Windows desktop app that extracts line items from estimate / quote / invoice PDFs and images into Excel-pasteable rows using Claude.

## For users

Download the latest installer from [Releases](https://github.com/mark2messmore/estimate-converter/releases/latest) and run it. The app auto-updates on launch.

- Requires Windows 10 (1803+) or Windows 11
- Uses system WebView2 (pre-installed on modern Windows)
- First launch may trigger "Unknown publisher" — click "More info" → "Run anyway"

## For developers

```bash
npm install
npm run dev            # Tauri dev (hot-reloads www/)
npm run build          # Builds release exe + NSIS installer
npm run worker:dev     # Local Cloudflare Worker on :8787
npm run worker:deploy  # Deploy Worker to Cloudflare
```

## Architecture

- **Frontend:** React 18 (CDN) + Tailwind, inlined into `www/index.html` as Babel-standalone JSX (no build step).
- **Desktop:** Tauri 2 (Rust). Single-file `src-tauri/src/main.rs` that just registers plugins; all logic is in the WebView. Built binary is ~4.5 MB.
- **Backend:** Cloudflare Worker (`worker/index.js`) at `https://purchase-req-helper.mark2messmore.workers.dev`. Single endpoint `/api/extract` forwards to Anthropic's `/v1/messages`. Same Worker serves `www/` static assets for browser testing.
- **Auto-updater:** Tauri updater plugin polls `latest.json` on the latest GitHub release.

The Anthropic API key lives only as a Cloudflare Worker secret (`ANTHROPIC_API_KEY`). The desktop app holds no keys.

## Layout

```
├── worker/index.js     # Cloudflare Worker (Anthropic proxy + static asset serving)
├── wrangler.toml       # Worker config
├── www/index.html      # Frontend (single-file React app)
├── www/libs/           # Tauri API shim
├── src-tauri/          # Tauri Rust shell
├── latest.json         # Auto-updater manifest (published as release asset)
├── RELEASE-GUIDE.md    # Step-by-step release procedure
└── CLAUDE.md           # Guidance for Claude Code sessions
```

## Releasing

See `RELEASE-GUIDE.md`.

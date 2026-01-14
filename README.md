# Estimate to Excel Converter

A desktop application that extracts line items from estimates, invoices, and quotes (PDF or images) and formats them for Excel using AI.

## Quick Start

### For Users
Just download and run `estimate-converter.exe` - no installation needed.

### For Developers

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run in dev mode:**
   ```bash
   npm run dev
   ```

3. **Build for distribution:**
   ```bash
   npm run build
   ```

   Output: `src-tauri/target/release/estimate-converter.exe` (~4.5 MB)

## Features

- Supports PDF and image files (PNG, JPG, WEBP)
- Drag & drop or paste from clipboard (Ctrl+V)
- Extracts line items: Part #, Description, UOM, Price, Qty
- One-click copy to Excel format
- Auto-updates when new versions are released
- Multi-provider AI support (Claude, Gemini, GPT-4)

## Architecture

- **Frontend:** React 18 (CDN) + Tailwind CSS
- **Desktop:** Tauri 2 (Rust) - produces ~4.5 MB exe
- **API:** Vercel serverless functions
- **AI Providers:** Anthropic Claude, Google Gemini, OpenAI GPT-4

## Admin Panel

Switch AI models on the fly:
```
https://estimate-to-excel-for-purchase-req.vercel.app/admin.html
```

## Environment Variables (Vercel)

| Variable | Description |
|----------|-------------|
| `ADMIN_PASSWORD` | Password for admin panel |
| `ANTHROPIC_API_KEY` | For Claude models |
| `GOOGLE_API_KEY` | For Gemini models |
| `OPENAI_API_KEY` | For GPT models |

## Project Structure

```
├── api/                    # Vercel serverless functions
│   ├── config.js           # Model configuration API
│   ├── extract.js          # AI extraction endpoint
│   └── providers.js        # Multi-provider adapters
├── www/                    # Frontend (served by Tauri)
│   └── index.html
├── src-tauri/              # Tauri (Rust) backend
│   ├── src/main.rs
│   ├── tauri.conf.json
│   └── Cargo.toml
├── public/                 # Vercel static files
│   ├── index.html
│   └── admin.html
└── package.json
```

## For Maintainers

See `RELEASE-GUIDE.md` (not in repo) for instructions on:
- Building new versions
- Signing updates
- Publishing releases to GitHub

## Notes

- Requires Windows 10 (1803+) or Windows 11
- Uses system WebView2 (pre-installed on modern Windows)
- First launch may trigger "Unknown publisher" warning - click "More info" → "Run anyway"

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="frontend/public/icons/logo-wordmark-dark.png">
  <img alt="SpoolKeep" src="frontend/public/icons/logo-wordmark-light.png" height="56">
</picture>

A self-hosted filament spool manager for 3D printing. Track your filament inventory, manage print files, write OpenSpool RFID tags, and export filament presets directly to OrcaSlicer or Bambu Studio — all from a browser on any device on your network.

> **Status**: Public beta (`v1.0.0-beta.1`). Core features are stable; the API surface may change before v1.0.

---

## Features

### Filament Inventory
- Add, edit, and delete filament spools with brand, material type, colour (hex), temperature ranges, used percentage, stock count, and notes
- Weight calculator to estimate usage percentage from a kitchen scale reading
- Track whether a spool has been opened and when
- Colour swatch grid sorted by hue, brand, type, usage, or date
- Search and multi-axis filtering (type, brand, text)
- Bulk delete and bulk OrcaSlicer preset export

### Autofill — Three Ways to Look Up a Filament
- **URL Scrape** — paste any product page URL and SpoolKeep extracts the filament data
- **Open Filament Database** — browse or globally search 14,000+ filament variants from the community-maintained [openfilamentdb.org](https://openfilamentdb.org)
- **Web Search** — search by brand + name and scrape results

### Photo OCR Label Scanning
With a Google Gemini API key configured, use your device camera to photograph a spool label and have the fields filled automatically.

### OrcaSlicer / Bambu Studio Integration
- Export individual filament presets as `.json` files ready to import into OrcaSlicer or Bambu Studio
- Bulk-export all spools as a `.zip` of presets
- Download a `.3mf` print file with embedded per-filament colour version presets already patched in, ready to slice

### Print File Library
- Upload `.stl` and `.3mf` model files (up to 500 MB)
- Automatic thumbnail extraction from `.3mf` archives (plate images)
- Client-side 3D thumbnail rendering for `.stl` uploads via Three.js
- Interactive in-browser 3D viewer
- Track "last printed" date per model with inline editing

### Colour Versions
Each print file can have multiple colour versions — named filament slot assignments that map to spools in your inventory. Colour versions let you track exactly which filaments you used for a given print run and re-slice with the same setup later.

- Auto-match filament slots to inventory by colour and material type
- AI colour recommendations for STL files via Google Gemini
- Per-slot filament assignment with inventory swatch picker

### OpenSpool RFID Tags
- Read OpenSpool-format NFC tags using the Web NFC API (Chrome on Android)
- Write your spool's data to a blank NFC tag to create a physical link
- Scanning a linked tag surfaces the matching spool instantly
- Unknown tags open a pre-filled form so you can review and save the new spool

### TD1s Spectrometer
Optional integration with the TD1s colorimeter for hardware colour measurement. When enabled (Settings → Hardware Integrations), a connection badge appears beside the Filament Colour field on the Add/Edit Spool form. Connect via USB HID, USB Serial, or Web MIDI and tap the device to capture the measured hex value directly.

### Progressive Web App
SpoolKeep ships a service worker and web app manifest. Add it to your home screen on iOS or Android for a full-screen, app-like experience with offline asset caching.

### Interface
- Material Design 3-inspired UI
- Dark, light, and system theme modes
- Animated page transitions
- Responsive layout — works on phone, tablet, and desktop

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, lucide-react, sonner, Three.js |
| Backend | Node.js, Express |
| Database | JSON flat files (`fs-extra`) |
| File handling | Multer, AdmZip, JSZip |
| Containerisation | Docker, Docker Compose |
| Autofill | Cheerio (scraping), Open Filament DB API, Google Gemini |

No external database required. All data lives in the `./data` directory as plain JSON, with uploaded files stored alongside it.

---

## Getting Started

### Docker (recommended)

```bash
git clone https://github.com/databoy2k/spoolkeep.git
cd spoolkeep
docker compose up -d --build
```

Open `http://localhost:5050` in your browser.

### Local Development

```bash
git clone https://github.com/databoy2k/spoolkeep.git
cd spoolkeep
npm install          # installs backend deps + triggers frontend install
npm run dev          # starts Express + Vite dev server concurrently
```

The Vite dev server proxies `/api` requests to Express on port 5050.

---

## Configuration

Create a `.env` file in the project root (never committed):

```env
# Optional — Google Gemini API key (for OCR label scanning and AI colour suggestions)
GEMINI_API_KEY=

# Optional — AES-256-GCM passphrase for encrypting the Gemini key on disk.
# Recommended for any internet-accessible deployment.
ENCRYPTION_KEY=
```

Both variables can also be left unset — SpoolKeep works fully without them (OCR and AI features are disabled). The Gemini key can alternatively be entered and stored via **Settings** in the UI.

---

## Deployment

See [self-hosting.md](self-hosting.md) for full deployment instructions including Docker Compose configuration, Nginx Proxy Manager SSL setup, and backup procedures.

---

## Data & Privacy

SpoolKeep is entirely self-hosted. No data leaves your server except:
- Outbound requests to the **Open Filament Database API** when browsing filament variants
- Outbound requests to **Google Gemini** when OCR or AI colour suggestions are used (only if you configure an API key)
- Outbound requests to third-party product pages when using URL scrape autofill

No analytics, no telemetry, no accounts.

---

## License

MIT

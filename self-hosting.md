# Self-Hosting SpoolKeep over HTTPS

SpoolKeep works from `http://localhost:5050` out of the box, but several features require a secure context (HTTPS):

- **Web NFC** — Chrome's Web NFC API (OpenSpool tag reading/writing) only works over HTTPS
- **Camera / OCR** — browsers restrict `getUserMedia` to secure contexts
- **PWA install** — adding to your home screen requires HTTPS

This guide shows how to reach SpoolKeep over HTTPS from any device on your local network, without exposing the app to the internet.

NOTE: SpoolKeep does not incorporate a login system. Exposing it to the internet is not recommended. This guide will show you how to expose it via HTTPS without doing that.

---

## How it works

Register a real domain whose DNS A record points to a **private LAN IP** (e.g. `192.168.1.50`). Because `192.168.x.x` is not internet-routable, the domain resolves on your LAN but is unreachable from outside. With a public domain in place you can get a valid Let's Encrypt certificate via a **DNS challenge** — no open inbound ports needed — giving you trusted HTTPS with no browser warnings.

---

## Prerequisites

- SpoolKeep is already running on a machine on your LAN — see [README.md](README.md) for setup
- [Nginx Proxy Manager](https://nginxproxymanager.com) (NPM) running somewhere on the same network
- A free [Cloudflare](https://cloudflare.com) account

---

## Step 1 — Register a domain

You need a domain you own. Any TLD works, but 6-9 digit number + `.xyz` domains are inexpensive and well-suited to personal projects — registrars like [Porkbun](https://porkbun.com) and [Namecheap](https://namecheap.com) typically sell them for $1–2/year (often under $1 for the first year).

Pick something short, or use random digits and letters, e.g. `8234567.xyz` or `mylocaldomain.ca`.

---

## Step 2 — Add the domain to Cloudflare and point it at your LAN

Cloudflare provides free DNS hosting and an API that NPM uses to prove domain ownership without any open internet ports.

1. Log in to [Cloudflare](https://cloudflare.com), click **Add a Site**, and enter your domain.
2. Follow the prompts to update your domain's nameservers to Cloudflare's (this setting is in your registrar's control panel).
3. Once Cloudflare activates, go to **DNS → Records** and create an **A record**:
   - **Name**: `@` for the root domain, or a subdomain like `spoolkeep`
   - **IPv4 address**: the LAN IP of the machine running SpoolKeep (e.g. `192.168.1.50`)
   - **Proxy status**: **DNS only** (grey cloud) — do not proxy through Cloudflare
4. Create a **Cloudflare API token** so NPM can complete the DNS challenge:
   - Go to **My Profile → API Tokens → Create Token**
   - Use the **Edit zone DNS** template, scoped to your specific domain
   - Save the token — you'll need it in the next step

> Set a static DHCP reservation (also called a "static lease") for the SpoolKeep machine in your router settings. This ensures its LAN IP never changes and your domain always resolves correctly.

---

## Step 3 — Configure Nginx Proxy Manager

1. Open the NPM admin panel and go to **Hosts → Proxy Hosts → Add Proxy Host**.
2. **Details tab**:
   - **Domain Names**: your domain or subdomain (e.g. `spoolkeep.8234567.xyz`)
   - **Scheme**: `http`
   - **Forward Hostname / IP**: the LAN IP of the SpoolKeep machine (e.g. `192.168.1.50`)
   - **Forward Port**: `5050`
   - Enable **Block Common Exploits** and **Websockets Support**
3. **SSL tab**:
   - **SSL Certificate**: Request a new Let's Encrypt certificate
   - Enable **Force SSL** and **HTTP/2**
   - Enable **DNS Challenge**, select **Cloudflare**, and paste your API token
4. Click **Save**.

NPM will request a certificate via DNS challenge. No open firewall ports are required. Once the cert is issued, `https://spoolkeep.8234567.xyz` (or whatever you chose) will load SpoolKeep securely from any device on your LAN.

---

## Environment Variables

Create a `.env` file in the project root to configure optional secrets. This file is never committed to git.

```env
# Optional — Google Gemini API key for photo OCR label scanning.
# If omitted, enter the key via Settings in the UI (stored encrypted on disk).
GEMINI_API_KEY=

# Optional — AES-256-GCM passphrase for the on-disk Gemini key.
# Recommended if you ever expose SpoolKeep beyond your LAN.
ENCRYPTION_KEY=
```

| Scenario | Where the key lives |
|---|---|
| `GEMINI_API_KEY` in `.env` | Container memory only — never written to disk |
| Key entered via Settings UI | Encrypted with AES-256-GCM in `data/settings.json` |
| No key configured | OCR scanning disabled |

When `GEMINI_API_KEY` is set via environment, the Settings panel displays `"Configured via Server Environment"` and locks the field to prevent accidental exposure.

---

## Backing Up Data

All user data lives in the `./data` directory alongside `docker-compose.yml`.

```bash
# Back up individual files
cp ./data/spools.json ./backups/spools_$(date +%F).json
cp ./data/print_files.json ./backups/print_files_$(date +%F).json
cp ./data/settings.json ./backups/settings_$(date +%F).json

# Or back up the entire data directory
tar -czf spoolkeep_backup_$(date +%F).tar.gz ./data/
```

> `data/uploads/` contains your uploaded STL and 3MF files and can grow large. Include it in backups if you want to preserve model files.

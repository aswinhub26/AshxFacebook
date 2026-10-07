# AshxStudio — Multi-Platform HD Media & Audio Extraction Studio

A high-performance multimedia platform built with **Apple iOS 26 Liquid Glassmorphism** and a **Python / yt-dlp backend** to extract 1080p Full HD video and 320kbps MP3 audio from Facebook Reels, Instagram Reels, YouTube Shorts, and WhatsApp Status.

---

## Key Features

- **Multi-Platform HD Extraction:** 1080p / 720p Full HD video and 320kbps MP3 audio extraction for Facebook, Instagram, YouTube Shorts, and WhatsApp.
- **Smart Auto-Clipboard Detection:** Automatically detects copied media URLs upon app focus with an interactive iOS Dynamic Island toast notification.
- **Streaming Proxy Architecture:** Server-side progressive stream demuxing directly to client with zero intermediate disk caching.
- **Progressive Web App (PWA):** 100% PWA compliant with offline service worker support and Android Share Target intent handling.
- **Agency-Tier UI:** Designed with smoked obsidian `#07070A` glassmorphism, Cupertino frosted cards, specular highlights, and spring physics.

---

## Tech Stack

- **Backend:** Python 3, Flask, yt-dlp, Gunicorn, Requests
- **Frontend:** HTML5 Canvas, Tailwind CSS, Lucide Icons, Plus Jakarta Sans & Inter typography
- **PWA & Mobile:** Service Worker (`sw.js`), Web App Manifest, Android WebView / TWA wrapper
- **Hosting & Infrastructure:** Render Web Services, GitHub Actions, UptimeRobot

---

## Quick Start (Local Development)

```bash
# 1. Clone repository
git clone https://github.com/aswinhub26/AshxStudio.git
cd AshxStudio

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start local development server
python app.py
```

Open `http://127.0.0.1:5000` in your browser.

---

## Deployment (Render)

1. Connect your repository to **Render.com**.
2. Select **Web Service** with runtime `Python 3`.
3. Set **Build Command:** `pip install -r requirements.txt`
4. Set **Start Command:** `gunicorn app:app`
5. Deploy on the **Free ($0/mo)** tier.

---

## License

MIT License. Designed and engineered for high-performance multimedia extraction.

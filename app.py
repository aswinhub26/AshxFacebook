import os
import re
import json
import logging
import urllib.parse
import requests
from flask import Flask, request, jsonify, render_template, Response, stream_with_context
import yt_dlp

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static', template_folder='templates')

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}

def clean_url(raw_url: str) -> str:
    """Cleans social URLs and resolves redirects."""
    raw_url = raw_url.strip()
    # Match share links that need redirect resolution
    if any(k in raw_url for k in ['share/r/', 'share/v/', 'youtu.be/', 'fb.watch/']):
        try:
            resp = requests.head(raw_url, headers=HEADERS, allow_redirects=True, timeout=5)
            if resp.url:
                raw_url = resp.url
        except Exception as e:
            logger.warning(f"Could not resolve redirect: {e}")
    return raw_url

def extract_media(url: str):
    """Multi-platform media extractor for FB Reels, Insta Reels, YouTube Shorts, etc."""
    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'extract_flat': False,
        'http_headers': HEADERS
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        
        formats = info.get('formats', [])
        hd_format = None
        sd_format = None
        audio_format = None
        
        video_formats = [f for f in formats if f.get('vcodec') != 'none' and f.get('url')]
        audio_formats = [f for f in formats if f.get('acodec') != 'none' and f.get('url')]
        
        if video_formats:
            combined = [f for f in video_formats if f.get('acodec') != 'none']
            if combined:
                combined.sort(key=lambda x: (x.get('height') or 0, x.get('tbr') or 0), reverse=True)
                hd_format = combined[0]
                sd_format = combined[-1] if len(combined) > 1 else combined[0]
            else:
                video_formats.sort(key=lambda x: (x.get('height') or 0, x.get('tbr') or 0), reverse=True)
                hd_format = video_formats[0]
                sd_format = video_formats[-1] if len(video_formats) > 1 else video_formats[0]
                
        if audio_formats:
            audio_formats.sort(key=lambda x: x.get('abr') or 0, reverse=True)
            audio_format = audio_formats[0]

        direct_hd_url = hd_format.get('url') if hd_format else info.get('url')
        direct_sd_url = sd_format.get('url') if sd_format else direct_hd_url
        direct_audio_url = audio_format.get('url') if audio_format else direct_hd_url

        platform = "Universal"
        if "facebook" in url or "fb.watch" in url: platform = "Facebook"
        elif "instagram" in url: platform = "Instagram"
        elif "youtube" in url or "youtu.be" in url: platform = "YouTube"
        elif "whatsapp" in url: platform = "WhatsApp"

        return {
            "platform": platform,
            "title": info.get('title') or f"AshxStudio {platform} Media",
            "description": info.get('description') or "",
            "thumbnail": info.get('thumbnail') or "",
            "duration": info.get('duration') or 0,
            "uploader": info.get('uploader') or info.get('channel') or f"{platform} Creator",
            "hd": {
                "url": direct_hd_url,
                "quality": f"{hd_format.get('height', '1080')}p Full HD" if hd_format and hd_format.get('height') else "1080p Full HD",
                "ext": "mp4"
            },
            "sd": {
                "url": direct_sd_url,
                "quality": f"{sd_format.get('height', '480')}p SD" if sd_format and sd_format.get('height') else "480p Standard",
                "ext": "mp4"
            },
            "audio": {
                "url": direct_audio_url,
                "quality": "320kbps MP3 Audio",
                "ext": "mp3"
            }
        }

@app.route('/')
def index():
    return render_template('index.html')

@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/api/extract', methods=['POST'])
def extract():
    data = request.get_json() or {}
    url = data.get('url', '').strip()
    
    if not url:
        return jsonify({"success": False, "error": "Please provide a valid media link."}), 400
    
    cleaned = clean_url(url)
    
    try:
        info = extract_media(cleaned)
        if info and (info.get('hd', {}).get('url') or info.get('audio', {}).get('url')):
            return jsonify({"success": True, "data": info})
    except Exception as e:
        logger.warning(f"yt-dlp extraction error: {e}")
        
    return jsonify({
        "success": False, 
        "error": "Could not extract media. Ensure the post is public and the link is active."
    }), 422

@app.route('/api/download')
def download():
    """Streaming proxy to force download with clean filename."""
    video_url = request.args.get('url')
    title = request.args.get('title', 'AshxStudio_Media')
    ext = request.args.get('ext', 'mp4')
    
    if not video_url:
        return "Missing media URL", 400
        
    safe_title = re.sub(r'[^a-zA-Z0-9_-]', '_', title)[:35]
    filename = f"AshxStudio_{safe_title}.{ext}"

    def stream_content():
        with requests.get(video_url, headers={'User-Agent': HEADERS['User-Agent']}, stream=True, timeout=30) as r:
            r.raise_for_status()
            for chunk in r.iter_content(chunk_size=65536):
                if chunk:
                    yield chunk

    mime = 'audio/mpeg' if ext == 'mp3' else 'video/mp4'

    return Response(
        stream_with_context(stream_content()),
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"',
            'Content-Type': mime,
            'Cache-Control': 'no-cache'
        }
    )

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("\n==========================================")
    print("AshxStudio Multi-Platform Studio Running!")
    print(f"Local Server: http://127.0.0.1:{port}")
    print("==========================================\n")
    app.run(host='0.0.0.0', port=port, debug=False)

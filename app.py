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
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-User': '?1',
    'Sec-Fetch-Dest': 'document'
}

def clean_fb_url(raw_url: str) -> str:
    """Cleans Facebook Reel / Video URLs and handles share links."""
    raw_url = raw_url.strip()
    # Match standard facebook reel patterns
    if 'share/r/' in raw_url or 'share/v/' in raw_url:
        try:
            # Resolve redirects if it's a share link
            resp = requests.head(raw_url, headers=HEADERS, allow_redirects=True, timeout=5)
            if resp.url:
                raw_url = resp.url
        except Exception as e:
            logger.warning(f"Could not resolve redirect for {raw_url}: {e}")
    return raw_url

def extract_with_ytdlp(url: str):
    """Primary extractor using yt-dlp with optimized Facebook parameters."""
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
        
        # Determine HD vs SD formats
        formats = info.get('formats', [])
        hd_format = None
        sd_format = None
        audio_format = None
        
        # Sort formats by resolution / quality
        video_formats = [f for f in formats if f.get('vcodec') != 'none' and f.get('url')]
        audio_formats = [f for f in formats if f.get('vcodec') == 'none' and f.get('acodec') != 'none' and f.get('url')]
        
        if video_formats:
            # Highest quality format with both video and audio or highest resolution
            best_combined = [f for f in video_formats if f.get('acodec') != 'none']
            if best_combined:
                best_combined.sort(key=lambda x: (x.get('height') or 0, x.get('tbr') or 0), reverse=True)
                hd_format = best_combined[0]
                sd_format = best_combined[-1] if len(best_combined) > 1 else best_combined[0]
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

        return {
            "title": info.get('title') or "AshxFacebook Reel Video",
            "description": info.get('description') or "",
            "thumbnail": info.get('thumbnail') or "",
            "duration": info.get('duration') or 0,
            "uploader": info.get('uploader') or info.get('channel') or "Facebook Creator",
            "view_count": info.get('view_count'),
            "like_count": info.get('like_count'),
            "hd": {
                "url": direct_hd_url,
                "quality": f"{hd_format.get('height', 'HD')}p" if hd_format and hd_format.get('height') else "HD 1080p/720p",
                "filesize": hd_format.get('filesize') or hd_format.get('filesize_approx') if hd_format else None,
                "ext": "mp4"
            },
            "sd": {
                "url": direct_sd_url,
                "quality": f"{sd_format.get('height', 'SD')}p" if sd_format and sd_format.get('height') else "SD 480p/360p",
                "filesize": sd_format.get('filesize') or sd_format.get('filesize_approx') if sd_format else None,
                "ext": "mp4"
            },
            "audio": {
                "url": direct_audio_url,
                "quality": "High Quality Audio",
                "ext": "mp3"
            }
        }

def fallback_direct_scrape(url: str):
    """Fallback scraper parsing page HTML tokens if yt-dlp misses something."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=8)
        html = resp.text
        
        hd_match = re.search(r'browser_native_hd_url["\']\s*:\s*["\']([^"\']+)["\']', html) or \
                   re.search(r'playable_url_quality_hd["\']\s*:\s*["\']([^"\']+)["\']', html) or \
                   re.search(r'hd_src["\']\s*:\s*["\']([^"\']+)["\']', html)
                   
        sd_match = re.search(r'browser_native_sd_url["\']\s*:\s*["\']([^"\']+)["\']', html) or \
                   re.search(r'playable_url["\']\s*:\s*["\']([^"\']+)["\']', html) or \
                   re.search(r'sd_src["\']\s*:\s*["\']([^"\']+)["\']', html)
                   
        thumb_match = re.search(r'thumbnailUrl["\']\s*:\s*["\']([^"\']+)["\']', html) or \
                      re.search(r'og:image["\']\s*content=["\']([^"\']+)["\']', html)
                      
        title_match = re.search(r'og:title["\']\s*content=["\']([^"\']+)["\']', html) or \
                      re.search(r'<title>([^<]+)</title>', html)

        def clean_json_url(u):
            if not u: return None
            return u.replace('\\/', '/').replace('\\u0025', '%').replace('\\u0026', '&')

        hd_url = clean_json_url(hd_match.group(1)) if hd_match else None
        sd_url = clean_json_url(sd_match.group(1)) if sd_match else None
        thumbnail = clean_json_url(thumb_match.group(1)) if thumb_match else ""
        title = title_match.group(1) if title_match else "AshxFacebook HD Video"

        if not hd_url and not sd_url:
            return None

        return {
            "title": title.replace(" | Facebook", "").strip(),
            "description": "",
            "thumbnail": thumbnail,
            "duration": 0,
            "uploader": "Facebook User",
            "hd": {
                "url": hd_url or sd_url,
                "quality": "HD Quality" if hd_url else "SD Quality",
                "ext": "mp4"
            },
            "sd": {
                "url": sd_url or hd_url,
                "quality": "SD Quality",
                "ext": "mp4"
            },
            "audio": {
                "url": hd_url or sd_url,
                "quality": "Audio Stream",
                "ext": "mp3"
            }
        }
    except Exception as e:
        logger.error(f"Fallback scrape failed: {e}")
        return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/extract', methods=['POST'])
def extract():
    data = request.get_json() or {}
    url = data.get('url', '').strip()
    
    if not url:
        return jsonify({"success": False, "error": "Please provide a valid Facebook Reel or Video link."}), 400
    
    clean_url = clean_fb_url(url)
    
    # Try yt-dlp first
    try:
        info = extract_with_ytdlp(clean_url)
        if info and (info.get('hd', {}).get('url') or info.get('sd', {}).get('url')):
            return jsonify({"success": True, "data": info})
    except Exception as e:
        logger.warning(f"yt-dlp extraction failed: {e}, attempting fallback...")
        
    # Fallback to direct scraper
    fallback_info = fallback_direct_scrape(clean_url)
    if fallback_info:
        return jsonify({"success": True, "data": fallback_info})
        
    return jsonify({
        "success": False, 
        "error": "Could not extract video. Ensure the Facebook Reel is public and the link is active."
    }), 422

@app.route('/api/download')
def download():
    """Streams video file directly to force download with clean filename."""
    video_url = request.args.get('url')
    title = request.args.get('title', 'AshxFacebook_Reel_HD')
    quality = request.args.get('quality', 'HD')
    
    if not video_url:
        return "Missing video URL", 400
        
    safe_title = re.sub(r'[^a-zA-Z0-9_-]', '_', title)[:40]
    filename = f"AshxFacebook_{safe_title}_{quality}.mp4"

    def stream_content():
        req_headers = {'User-Agent': HEADERS['User-Agent']}
        with requests.get(video_url, headers=req_headers, stream=True, timeout=30) as r:
            r.raise_for_status()
            for chunk in r.iter_content(chunk_size=65536):
                if chunk:
                    yield chunk

    return Response(
        stream_with_context(stream_content()),
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"',
            'Content-Type': 'video/mp4',
            'Cache-Control': 'no-cache'
        }
    )

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("\n==========================================")
    print("AshxFacebook HD Downloader Running!")
    print(f"Local Server: http://127.0.0.1:{port}")
    print("==========================================\n")
    app.run(host='0.0.0.0', port=port, debug=False)

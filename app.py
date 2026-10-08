import os
import re
import json
import logging
import urllib.parse
import requests
from flask import Flask, request, jsonify, render_template, Response, stream_with_context, send_from_directory
try:
    from flask_cors import CORS
    has_cors = True
except ImportError:
    has_cors = False
import yt_dlp

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static', template_folder='templates')
if has_cors:
    CORS(app)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}

def clean_url(raw_url: str) -> str:
    """Cleans social URLs and resolves redirects."""
    raw_url = raw_url.strip()
    
    # Fast regex normalization for YouTube Shorts and youtu.be to avoid network redirects
    shorts_match = re.search(r'youtube\.com/shorts/([a-zA-Z0-9_-]+)', raw_url)
    if shorts_match:
        return f"https://www.youtube.com/watch?v={shorts_match.group(1)}"
        
    youtu_match = re.search(r'youtu\.be/([a-zA-Z0-9_-]+)', raw_url)
    if youtu_match:
        return f"https://www.youtube.com/watch?v={youtu_match.group(1)}"

    if any(k in raw_url for k in ['share/r/', 'share/v/', 'fb.watch/']):
        try:
            resp = requests.head(raw_url, headers=HEADERS, allow_redirects=True, timeout=5)
            if resp.url:
                raw_url = resp.url
        except Exception as e:
            logger.warning(f"Could not resolve redirect: {e}")
    return raw_url

def extract_media(url: str, custom_sessionid: str = None):
    """Multi-platform media extractor for FB Reels, Insta Reels, YouTube Shorts, etc."""
    ydl_opts = {
        'format': 'best[ext=mp4]/bestvideo+bestaudio/best',
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'extract_flat': False,
        'nocheckcertificate': True,
        'socket_timeout': 10,
        'extractor_args': {
            'youtube': {
                'player_client': ['android', 'android_vr']
            }
        }
    }
    
    cookie_file = None
    if os.path.exists('cookies.txt'):
        cookie_file = 'cookies.txt'
    elif os.environ.get('IG_COOKIES'):
        try:
            with open('ig_cookies.txt', 'w') as f:
                f.write(os.environ.get('IG_COOKIES'))
            cookie_file = 'ig_cookies.txt'
        except Exception as ce:
            logger.warning(f"Could not write cookie file: {ce}")
    elif custom_sessionid or os.environ.get('IG_SESSIONID'):
        sess_val = (custom_sessionid or os.environ.get('IG_SESSIONID')).strip()
        try:
            netscape_cookie = (
                "# Netscape HTTP Cookie File\n"
                f".instagram.com\tTRUE\t/\tTRUE\t2147483647\tsessionid\t{sess_val}\n"
            )
            with open('ig_session_cookies.txt', 'w') as f:
                f.write(netscape_cookie)
            cookie_file = 'ig_session_cookies.txt'
        except Exception as ce:
            logger.warning(f"Could not write session cookie file: {ce}")

    if cookie_file:
        ydl_opts['cookiefile'] = cookie_file
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        formats = info.get('formats', [])
        
        # 1. Progressive formats (both video and audio with direct HTTP/HTTPS url)
        prog_videos = [
            f for f in formats 
            if f.get('vcodec') != 'none' and f.get('acodec') != 'none' 
            and f.get('url') and 'm3u8' not in f.get('protocol', '')
        ]
        prog_videos.sort(key=lambda x: (x.get('height') or 0, x.get('tbr') or 0), reverse=True)

        # 2. Direct video formats (if progressive not present)
        all_videos = [
            f for f in formats 
            if f.get('vcodec') != 'none' and f.get('url') 
            and 'm3u8' not in f.get('protocol', '')
        ]
        all_videos.sort(key=lambda x: (x.get('height') or 0, x.get('tbr') or 0), reverse=True)

        # 3. Direct audio formats
        audios = [
            f for f in formats 
            if f.get('acodec') != 'none' and f.get('url') 
            and 'm3u8' not in f.get('protocol', '')
        ]
        audios.sort(key=lambda x: (x.get('abr') or x.get('tbr') or 0), reverse=True)

        chosen_hd = prog_videos[0] if prog_videos else (all_videos[0] if all_videos else None)
        chosen_sd = prog_videos[-1] if prog_videos else (all_videos[-1] if all_videos else None)
        chosen_audio = audios[0] if audios else (chosen_hd if chosen_hd else None)

        direct_hd_url = chosen_hd.get('url') if chosen_hd else info.get('url')
        direct_sd_url = chosen_sd.get('url') if chosen_sd else direct_hd_url
        direct_audio_url = chosen_audio.get('url') if chosen_audio else direct_hd_url

        platform = "Universal"
        if "facebook" in url or "fb.watch" in url: platform = "Facebook"
        elif "instagram" in url: platform = "Instagram"
        elif "youtube" in url or "youtu.be" in url: platform = "YouTube"
        elif "whatsapp" in url: platform = "WhatsApp"

        hd_height = chosen_hd.get('height') if chosen_hd else None
        sd_height = chosen_sd.get('height') if chosen_sd else None
        
        hd_label = f"{hd_height}p HD (Sound Included)" if hd_height else "1080p Full HD"
        sd_label = f"{sd_height}p SD (Sound Included)" if sd_height else "480p Standard"
        
        audio_ext = "mp3"
        if chosen_audio and chosen_audio.get('ext') in ['m4a', 'aac', 'mp3']:
            audio_ext = chosen_audio.get('ext')

        return {
            "platform": platform,
            "title": info.get('title') or f"AshxStudio {platform} Media",
            "description": info.get('description') or "",
            "thumbnail": info.get('thumbnail') or "",
            "duration": info.get('duration') or 0,
            "uploader": info.get('uploader') or info.get('channel') or f"{platform} Creator",
            "hd": {
                "url": direct_hd_url,
                "quality": hd_label,
                "ext": "mp4"
            },
            "sd": {
                "url": direct_sd_url,
                "quality": sd_label,
                "ext": "mp4"
            },
            "audio": {
                "url": direct_audio_url,
                "quality": "320kbps Audio (HQ)",
                "ext": audio_ext
            }
        }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/sw.js')
def serve_sw():
    return send_from_directory('.', 'sw.js', mimetype='application/javascript')

@app.route('/manifest.json')
def serve_manifest():
    return send_from_directory('static', 'manifest.json', mimetype='application/manifest+json')

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
    custom_sessionid = data.get('ig_sessionid', '').strip() or request.headers.get('X-IG-SessionId', '').strip()
    
    if not url:
        return jsonify({"success": False, "error": "Please provide a valid media link."}), 400
    
    cleaned = clean_url(url)
    
    try:
        info = extract_media(cleaned, custom_sessionid=custom_sessionid)
        if info and (info.get('hd', {}).get('url') or info.get('audio', {}).get('url')):
            return jsonify({"success": True, "data": info})
    except Exception as e:
        err_str = str(e)
        logger.warning(f"yt-dlp extraction error: {err_str}")
        if "not granting access" in err_str or "empty media response" in err_str or "login" in err_str.lower():
            return jsonify({
                "success": False, 
                "error": "Instagram restricted access to this Reel without a login session. Add your Instagram Session ID in AshxStudio Settings or in Render environment variables (IG_SESSIONID).",
                "needs_ig_auth": True
            }), 403
        elif "private" in err_str.lower():
            return jsonify({
                "success": False, 
                "error": "This post is from a Private Account. Only public media can be downloaded without authentication."
            }), 403
        elif "copyright" in err_str.lower() or "blocked" in err_str.lower():
            return jsonify({
                "success": False, 
                "error": "This media is blocked or restricted by the platform."
            }), 403
        
    return jsonify({
        "success": False, 
        "error": f"Extraction error: {err_str}" if 'err_str' in locals() else "Could not extract media. Ensure the link is public and active."
    }), 422

@app.route('/api/download')
def download():
    """High-speed streaming proxy ensuring 100% genuine MP4/MP3 media byte delivery."""
    video_url = request.args.get('url', '').strip()
    title = request.args.get('title', 'AshxStudio_Media').strip()
    ext = request.args.get('ext', 'mp4').strip().lower()
    
    if not video_url:
        return jsonify({"error": "Missing media URL"}), 400
        
    safe_title = re.sub(r'[^a-zA-Z0-9_-]', '_', title)[:40]
    filename = f"AshxStudio_{safe_title}.{ext}"
    
    mime_map = {
        'mp3': 'audio/mpeg',
        'm4a': 'audio/mp4',
        'aac': 'audio/aac',
        'mp4': 'video/mp4',
        'webm': 'video/webm'
    }
    mime = mime_map.get(ext, 'application/octet-stream')

    try:
        req_headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
            'Connection': 'keep-alive'
        }
        
        # Pass range header for mobile players (iOS Safari / Android Chrome)
        range_header = request.headers.get('Range')
        if range_header:
            req_headers['Range'] = range_header
        
        upstream_resp = requests.get(video_url, headers=req_headers, stream=True, timeout=60, allow_redirects=True)
        
        # Verify upstream returned actual media, not an HTML error or block page
        content_type = upstream_resp.headers.get('Content-Type', '')
        if 'text/html' in content_type or upstream_resp.status_code >= 400:
            logger.warning(f"Upstream returned non-media response: {upstream_resp.status_code} {content_type}")
            return jsonify({"error": "Direct media link expired or blocked. Please refresh and try again."}), 502

        def stream_content():
            try:
                for chunk in upstream_resp.iter_content(chunk_size=65536):
                    if chunk:
                        yield chunk
            except Exception as e:
                logger.error(f"Stream error: {e}")

        resp_headers = {
            'Content-Disposition': f'attachment; filename="{filename}"',
            'Content-Type': mime,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Accept-Ranges': 'bytes'
        }
        
        if 'Content-Length' in upstream_resp.headers:
            resp_headers['Content-Length'] = upstream_resp.headers['Content-Length']
        if 'Content-Range' in upstream_resp.headers:
            resp_headers['Content-Range'] = upstream_resp.headers['Content-Range']

        status_code = upstream_resp.status_code if upstream_resp.status_code in [200, 206] else 200
        return Response(stream_with_context(stream_content()), status=status_code, headers=resp_headers)

    except Exception as e:
        logger.error(f"Download stream error: {e}")
        return jsonify({"error": f"Failed to download media: {str(e)}"}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("\n==========================================")
    print("AshxStudio Multi-Platform Studio Running!")
    print(f"Local Server: http://127.0.0.1:{port}")
    print("==========================================\n")
    app.run(host='0.0.0.0', port=port, debug=False)

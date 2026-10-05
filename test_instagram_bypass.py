import yt_dlp

url = "https://www.instagram.com/reel/Dc0JSMuTrfl/"

ydl_opts = {
    'quiet': False,
    'skip_download': True,
    'http_headers': {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-User': '?1',
        'Sec-Fetch-Dest': 'document'
    },
    'extractor_args': {
        'instagram': {
            'api_endpoint': ['api'],
            'app_id': ['936619743392459']
        }
    }
}

try:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        print("SUCCESS! Title:", info.get('title'))
        print("Video URL:", bool(info.get('url') or info.get('formats')))
except Exception as e:
    print("Error:", e)

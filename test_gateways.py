import requests
import json
import urllib.parse

url = "https://www.instagram.com/reel/Dc0JSMuTrfl/"
clean_url = "https://www.instagram.com/reel/Dc0JSMuTrfl"

print("--- Testing Live Instagram Public Gateways ---")

gateways = [
    ("FastDL API", "https://api.fastdl.app/api/convert", {"url": url}),
    ("Snapinsta API", "https://snapinsta.app/api/ajaxSearch", {"q": url, "t": "media", "lang": "en"}),
    ("FDownloader", "https://v3.fdownloader.net/api/ajaxSearch", {"q": url, "lang": "en"}),
    ("SaveIG API", "https://api.saveig.app/api/v1/instagram?url=" + urllib.parse.quote(url), None),
    ("AllTube / Social API", "https://alltube.pl/api/extract?url=" + urllib.parse.quote(url), None),
    ("Cobalt v10 mirror 1", "https://api.cobalt.tools", {"url": url}),
    ("Cobalt v10 mirror 2", "https://co.wuk.sh/api/json", {"url": url}),
    ("Render Public Worker", "https://fbdown-api.onrender.com/api/get?url=" + urllib.parse.quote(url), None)
]

for name, ep, payload in gateways:
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Referer": "https://google.com"
        }
        if payload:
            r = requests.post(ep, data=payload if "snap" in ep or "fdown" in ep else json.dumps(payload), 
                              headers={"Content-Type": "application/x-www-form-urlencoded" if "snap" in ep or "fdown" in ep else "application/json", **headers},
                              timeout=6)
        else:
            r = requests.get(ep, headers=headers, timeout=6)
        
        print(f"[{name}] Status: {r.status_code}")
        text = r.text
        if ".mp4" in text or "video" in text or "url" in text:
            print(f"[{name}] Found possible video stream: {text[:200]}")
    except Exception as e:
        print(f"[{name}] Error: {e}")

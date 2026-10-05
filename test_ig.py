import requests
import json
import re

url = "https://www.instagram.com/reel/DdamuszTEx_/"

# Test Cobalt v10 format:
try:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
    }
    r = requests.post("https://api.cobalt.tools/", json={"url": url, "videoQuality": "1080"}, headers=headers, timeout=5)
    print("Cobalt v10 status:", r.status_code, r.text[:200])
except Exception as e:
    print("Cobalt v10 error:", e)

# Test SnapInsta / SaveIG public APIs
try:
    r = requests.post("https://v3.fdownloader.net/api/ajaxSearch", data={"k_exp": "", "k_token": "", "q": url, "lang": "en"}, headers={"User-Agent": "Mozilla/5.0"}, timeout=5)
    print("FDownloader status:", r.status_code, r.text[:200])
except Exception as e:
    print("FDownloader error:", e)

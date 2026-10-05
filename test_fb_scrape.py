import requests
import json
import re

url = "https://www.facebook.com/share/r/1DiLeobAuE/"

print("--- Resolving Facebook Redirect ---")
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
}
resp = requests.head(url, allow_redirects=True, headers=headers)
print("Resolved URL:", resp.url)

# Test extracting direct HTML from resolved URL
r = requests.get(resp.url, headers=headers)
print("HTML Status:", r.status_code, "HTML Length:", len(r.text))

hd_match = re.search(r'browser_native_hd_url["\']\s*:\s*["\']([^"\']+)["\']', r.text) or \
           re.search(r'playable_url_quality_hd["\']\s*:\s*["\']([^"\']+)["\']', r.text) or \
           re.search(r'hd_src["\']\s*:\s*["\']([^"\']+)["\']', r.text)
           
sd_match = re.search(r'browser_native_sd_url["\']\s*:\s*["\']([^"\']+)["\']', r.text) or \
           re.search(r'playable_url["\']\s*:\s*["\']([^"\']+)["\']', r.text) or \
           re.search(r'sd_src["\']\s*:\s*["\']([^"\']+)["\']', r.text)

print("HD Match:", bool(hd_match))
print("SD Match:", bool(sd_match))
if hd_match or sd_match:
    match_str = (hd_match or sd_match).group(1)
    clean = match_str.replace('\\u0025', '%').replace('\\u0026', '&').replace('\\/', '/')
    print("Found direct stream URL:", clean[:100])

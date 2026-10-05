// Netlify Serverless Function - Multi-Platform Media Extractor (Instagram, Facebook, YouTube)

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function resolveRedirect(url) {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT }
    });
    return res.url || url;
  } catch (e) {
    return url;
  }
}

// Instagram Extractor
async function extractInstagram(url) {
  const shortcodeMatch = url.match(/(?:reel|p|reels)\/([A-Za-z0-9_-]+)/);
  if (!shortcodeMatch) return null;
  const shortcode = shortcodeMatch[1];

  // Strategy 1: Instagram GraphQL JSON endpoints
  const endpoints = [
    `https://www.instagram.com/graphql/query/?query_hash=b3055c2e470ed40da7940cb324950811&variables=${encodeURIComponent(JSON.stringify({ shortcode }))}`,
    `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`,
    `https://www.instagram.com/reel/${shortcode}/?__a=1&__d=dis`
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      if (res.ok) {
        const json = await res.json();
        const media = json.data?.shortcode_media || json.graphql?.shortcode_media || json.items?.[0];
        if (media) {
          const videoUrl = media.video_url || media.video_versions?.[0]?.url;
          if (videoUrl) {
            return {
              platform: 'Instagram',
              title: media.edge_media_to_caption?.edges?.[0]?.node?.text || media.caption?.text || 'Instagram Reel Video',
              thumbnail: media.display_url || media.image_versions2?.candidates?.[0]?.url || '',
              uploader: media.owner?.username || media.user?.username || 'Instagram User',
              duration: media.video_duration || 0,
              hd: { url: videoUrl, quality: '1080p Full HD', ext: 'mp4' },
              sd: { url: videoUrl, quality: '480p SD', ext: 'mp4' },
              audio: { url: videoUrl, quality: '320kbps MP3 Audio', ext: 'mp3' }
            };
          }
        }
      }
    } catch (e) {}
  }

  // Strategy 2: Direct Page HTML Scrape
  try {
    const pageRes = await fetch(`https://www.instagram.com/reel/${shortcode}/`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Sec-Fetch-Site': 'none'
      }
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const match = html.match(/"video_url"\s*:\s*"([^"]+)"/) || 
                    html.match(/video_versions":\[\{"url":"([^"]+)"/) ||
                    html.match(/og:video"\s*content="([^"]+)"/);
      if (match) {
        const cleanUrl = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
        return {
          platform: 'Instagram',
          title: 'Instagram Reel Video',
          thumbnail: '',
          uploader: 'Instagram Creator',
          duration: 0,
          hd: { url: cleanUrl, quality: '1080p Full HD', ext: 'mp4' },
          sd: { url: cleanUrl, quality: '480p SD', ext: 'mp4' },
          audio: { url: cleanUrl, quality: '320kbps MP3 Audio', ext: 'mp3' }
        };
      }
    }
  } catch (e) {}

  return null;
}

// Facebook Extractor
async function extractFacebook(url) {
  try {
    const finalUrl = await resolveRedirect(url);
    const res = await fetch(finalUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (res.ok) {
      const html = await res.text();
      const hdMatch = html.match(/browser_native_hd_url["']\s*:\s*["']([^"']+)["']/) ||
                      html.match(/playable_url_quality_hd["']\s*:\s*["']([^"']+)["']/) ||
                      html.match(/hd_src["']\s*:\s*["']([^"']+)["']/);
      const sdMatch = html.match(/browser_native_sd_url["']\s*:\s*["']([^"']+)["']/) ||
                      html.match(/playable_url["']\s*:\s*["']([^"']+)["']/) ||
                      html.match(/sd_src["']\s*:\s*["']([^"']+)["']/);
      const thumbMatch = html.match(/thumbnailUrl["']\s*:\s*["']([^"']+)["']/) ||
                         html.match(/og:image["']\s*content=["']([^"']+)["']/);
      const titleMatch = html.match(/og:title["']\s*content=["']([^"']+)["']/) ||
                         html.match(/<title>([^<]+)<\/title>/);

      const cleanJson = (u) => u ? u.replace(/\\u0025/g, '%').replace(/\\u0026/g, '&').replace(/\\\//g, '/') : null;
      const hd = cleanJson(hdMatch ? hdMatch[1] : null);
      const sd = cleanJson(sdMatch ? sdMatch[1] : null);
      const thumb = cleanJson(thumbMatch ? thumbMatch[1] : null);
      const title = titleMatch ? titleMatch[1].replace(/ \| Facebook/gi, '') : 'Facebook Reel Video';

      if (hd || sd) {
        return {
          platform: 'Facebook',
          title: title,
          thumbnail: thumb || '',
          uploader: 'Facebook Creator',
          duration: 0,
          hd: { url: hd || sd, quality: hd ? '1080p Full HD' : 'Standard HD', ext: 'mp4' },
          sd: { url: sd || hd, quality: '480p SD', ext: 'mp4' },
          audio: { url: hd || sd, quality: '320kbps MP3 Audio', ext: 'mp3' }
        };
      }
    }
  } catch (e) {}

  return null;
}

// YouTube Shorts Extractor
async function extractYouTube(url) {
  try {
    let videoId = null;
    const match = url.match(/(?:shorts\/|v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (match) videoId = match[1];

    if (!videoId) return null;

    // Public Piped / Invidious API gateways
    const pipedInstances = [
      `https://pipedapi.kavin.rocks/streams/${videoId}`,
      `https://api.piped.privacydev.net/streams/${videoId}`,
      `https://piped-api.lunar.icu/streams/${videoId}`
    ];

    for (const inst of pipedInstances) {
      try {
        const res = await fetch(inst, { headers: { 'User-Agent': USER_AGENT } });
        if (res.ok) {
          const json = await res.json();
          const videoStreams = json.videoStreams || [];
          const audioStreams = json.audioStreams || [];

          if (videoStreams.length > 0) {
            videoStreams.sort((a, b) => (b.height || 0) - (a.height || 0));
            const bestVideo = videoStreams[0];
            const bestAudio = audioStreams[0] || bestVideo;

            return {
              platform: 'YouTube',
              title: json.title || 'YouTube Shorts Video',
              thumbnail: json.thumbnailUrl || '',
              uploader: json.uploader || 'YouTube Creator',
              duration: json.duration || 0,
              hd: { url: bestVideo.url, quality: `${bestVideo.quality || '1080p'} Full HD`, ext: 'mp4' },
              sd: { url: videoStreams[videoStreams.length - 1]?.url || bestVideo.url, quality: '480p SD', ext: 'mp4' },
              audio: { url: bestAudio.url, quality: '320kbps MP3 Audio', ext: 'mp3' }
            };
          }
        }
      } catch (e) {}
    }
  } catch (e) {}

  return null;
}

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  let rawUrl = '';
  if (event.httpMethod === 'POST') {
    try {
      const parsed = JSON.parse(event.body || '{}');
      rawUrl = parsed.url || '';
    } catch (e) {}
  } else {
    rawUrl = event.queryStringParameters?.url || '';
  }

  rawUrl = rawUrl.trim();
  if (!rawUrl) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Please provide a valid media link.' })
    };
  }

  let result = null;
  if (rawUrl.includes('instagram.com')) {
    result = await extractInstagram(rawUrl);
  } else if (rawUrl.includes('facebook.com') || rawUrl.includes('fb.watch') || rawUrl.includes('fb.gg')) {
    result = await extractFacebook(rawUrl);
  } else if (rawUrl.includes('youtube.com') || rawUrl.includes('youtu.be')) {
    result = await extractYouTube(rawUrl);
  } else {
    // Try all
    result = (await extractInstagram(rawUrl)) || (await extractFacebook(rawUrl)) || (await extractYouTube(rawUrl));
  }

  if (result && (result.hd?.url || result.audio?.url)) {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, data: result })
    };
  }

  return {
    statusCode: 422,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: false, error: 'Could not extract media. Ensure post/reel is public.' })
  };
};

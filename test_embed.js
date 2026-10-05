const fs = require('fs');

async function parseEmbed() {
  const url = 'https://www.instagram.com/p/DdamuszTEx_/embed/captioned/';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
  const html = await res.text();
  
  const matches = html.match(/https:[^"'\s]+cdninstagram\.com[^"'\s]+/g);
  console.log('CDN links found:', matches ? matches.length : 0);
  if (matches) {
    let found = false;
    for (const m of matches) {
      const clean = m.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
      if (clean.includes('.mp4') || clean.includes('/v/') || clean.includes('bytestart')) {
        console.log('SUCCESS! Video stream found:', clean.substring(0, 150));
        found = true;
        break;
      }
    }
    if (!found) console.log('Sample CDN link:', matches[0].substring(0, 120));
  }
}
parseEmbed();

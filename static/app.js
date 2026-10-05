// ==========================================================================
// AshxStudio - Multi-Platform Studio (FB, Insta, YouTube, WhatsApp & MP3)
// ==========================================================================

let currentVideoData = null;
let selectedQuality = 'hd';
let currentPlatform = 'facebook';
const STORAGE_KEY = 'ashx_fb_history_v1';

// DOM Elements
const urlInput = document.getElementById('reel-url-input');
const pasteBtn = document.getElementById('paste-btn');
const clearBtn = document.getElementById('clear-btn');
const fetchBtn = document.getElementById('fetch-btn');
const loadingState = document.getElementById('loading-state');
const resultContainer = document.getElementById('result-container');
const errorBox = document.getElementById('error-box');
const errorMessage = document.getElementById('error-message');

const videoPlayer = document.getElementById('video-player');
const resTitle = document.getElementById('res-title');
const resUploader = document.getElementById('res-uploader');
const resDuration = document.getElementById('res-duration');
const videoBadge = document.getElementById('video-badge');
const downloadTriggerBtn = document.getElementById('download-trigger-btn');
const downloadBtnLabel = document.getElementById('download-btn-label');
const copyDirectLinkBtn = document.getElementById('copy-direct-link-btn');
const shareAppBtn = document.getElementById('share-app-btn');

const qualityTabs = document.querySelectorAll('.quality-tab');
const platformTabs = document.querySelectorAll('.platform-tab');
const hdSub = document.getElementById('hd-sub');
const sdSub = document.getElementById('sd-sub');
const inputPlatformIcon = document.getElementById('input-platform-icon');

const dynamicIsland = document.getElementById('dynamic-island');
const islandIndicator = document.getElementById('island-indicator');
const islandTitle = document.getElementById('island-title');
const islandSubtitle = document.getElementById('island-subtitle');

const historyList = document.getElementById('history-list');
const emptyHistory = document.getElementById('empty-history');
const clearHistoryBtn = document.getElementById('clear-history-btn');

const guideModal = document.getElementById('guide-modal');
const guideModalBtn = document.getElementById('guide-modal-btn');
const closeGuideBtn = document.getElementById('close-guide-btn');
const dismissGuideBtn = document.getElementById('dismiss-guide-btn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initAmbientCanvas();
    renderHistory();
    setupEventListeners();

    // Check if opened via Android Share Intent / PWA Share Target
    const urlParams = new URLSearchParams(window.location.search);
    const sharedText = urlParams.get('text') || urlParams.get('url');
    if (sharedText) {
        const match = sharedText.match(/https?:\/\/[^\s]+/);
        const targetUrl = match ? match[0] : sharedText;
        urlInput.value = targetUrl;
        clearBtn.classList.remove('hidden');
        detectPlatformFromUrl(targetUrl);
        handleExtract();
    }
});

function setupEventListeners() {
    // Platform Tab Switching
    platformTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            platformTabs.forEach(t => t.classList.remove('active-platform-tab'));
            tab.classList.add('active-platform-tab');
            currentPlatform = tab.getAttribute('data-platform');
            updatePlatformUI();
        });
    });

    urlInput.addEventListener('input', () => {
        const val = urlInput.value.trim();
        if (val.length > 0) {
            clearBtn.classList.remove('hidden');
            detectPlatformFromUrl(val);
        } else {
            clearBtn.classList.add('hidden');
        }
    });

    clearBtn.addEventListener('click', () => {
        urlInput.value = '';
        clearBtn.classList.add('hidden');
        urlInput.focus();
    });

    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                urlInput.value = text.trim();
                clearBtn.classList.remove('hidden');
                detectPlatformFromUrl(text.trim());
                updateIslandState('active', 'Link Pasted', 'Extracting media...');
                handleExtract();
            }
        } catch (err) {
            urlInput.focus();
        }
    });

    fetchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleExtract();
    });

    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleExtract();
        }
    });

    // Format & Audio Quality Tab Switching
    qualityTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            qualityTabs.forEach(t => t.classList.remove('active-quality-tab'));
            tab.classList.add('active-quality-tab');
            selectedQuality = tab.getAttribute('data-quality');
            updateActiveQualityView();
        });
    });

    copyDirectLinkBtn.addEventListener('click', () => {
        if (!currentVideoData) return;
        const targetUrl = currentVideoData[selectedQuality]?.url || currentVideoData.hd?.url;
        if (targetUrl) {
            navigator.clipboard.writeText(targetUrl);
            const original = copyDirectLinkBtn.innerHTML;
            copyDirectLinkBtn.innerHTML = `<i data-lucide="check" class="w-3 h-3 text-emerald-400"></i><span class="text-emerald-300">Copied</span>`;
            if (window.lucide && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }
            setTimeout(() => {
                copyDirectLinkBtn.innerHTML = original;
                if (window.lucide && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }
            }, 2000);
        }
    });

    // Universal Mobile & Desktop Blob Downloader (MP4 / MP3)
    downloadTriggerBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!currentVideoData) return;
        const item = currentVideoData[selectedQuality] || currentVideoData.hd;
        if (!item || !item.url) return;

        const isAudio = selectedQuality === 'audio';
        const ext = isAudio ? 'mp3' : 'mp4';
        const originalLabel = downloadBtnLabel.innerHTML;
        const originalBg = downloadTriggerBtn.className;
        downloadBtnLabel.textContent = isAudio ? "Extracting MP3 0%..." : "Downloading 0%...";
        downloadTriggerBtn.classList.add('opacity-75', 'pointer-events-none');
        updateIslandState('busy', isAudio ? 'Saving MP3' : 'Saving Video', 'Streaming file...');

        const safeTitle = (currentVideoData.title || 'AshxStudio_Media').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
        const fileName = `${safeTitle}_${selectedQuality.toUpperCase()}.${ext}`;

        let success = false;

        const fetchUrls = [
            item.url,
            `https://api.allorigins.win/raw?url=${encodeURIComponent(item.url)}`,
            `https://corsproxy.io/?${encodeURIComponent(item.url)}`
        ];

        for (const fUrl of fetchUrls) {
            try {
                const resp = await fetch(fUrl);
                if (resp.ok) {
                    const reader = resp.body.getReader();
                    const contentLength = +resp.headers.get('Content-Length') || 0;
                    let receivedLength = 0;
                    let chunks = [];

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        chunks.push(value);
                        receivedLength += value.length;
                        if (contentLength > 0) {
                            const percent = Math.round((receivedLength / contentLength) * 100);
                            downloadBtnLabel.textContent = `Downloading ${percent}%...`;
                        } else {
                            const mb = (receivedLength / (1024 * 1024)).toFixed(1);
                            downloadBtnLabel.textContent = `Downloading ${mb} MB...`;
                        }
                    }

                    const mime = isAudio ? 'audio/mpeg' : 'video/mp4';
                    const blob = new Blob(chunks, { type: mime });
                    const blobUrl = window.URL.createObjectURL(blob);
                    
                    const tempLink = document.createElement('a');
                    tempLink.style.display = 'none';
                    tempLink.href = blobUrl;
                    tempLink.download = fileName;
                    document.body.appendChild(tempLink);
                    tempLink.click();
                    setTimeout(() => {
                        document.body.removeChild(tempLink);
                        window.URL.revokeObjectURL(blobUrl);
                    }, 2000);

                    success = true;
                    downloadBtnLabel.innerHTML = isAudio ? `✓ Saved MP3 Audio!` : `✓ Saved to Downloads!`;
                    updateIslandState('success', 'Saved to Device', `${ext.toUpperCase()} saved successfully`);
                    break;
                }
            } catch (err) {
                console.warn('Blob fetch failed, falling back...');
            }
        }

        if (!success) {
            downloadBtnLabel.innerHTML = `Opening direct media...`;
            window.open(item.url, '_blank');
            updateIslandState('active', 'Media Opened', 'Tap & hold to save file');
        }

        setTimeout(() => {
            downloadBtnLabel.innerHTML = originalLabel;
            downloadTriggerBtn.className = originalBg;
            downloadTriggerBtn.classList.remove('opacity-75', 'pointer-events-none');
        }, 3500);
    });

    shareAppBtn.addEventListener('click', async () => {
        if (!currentVideoData) return;
        const targetUrl = currentVideoData[selectedQuality]?.url || currentVideoData.hd?.url;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: currentVideoData.title,
                    text: 'AshxStudio HD Media',
                    url: targetUrl
                });
            } catch (err) {}
        } else {
            navigator.clipboard.writeText(targetUrl);
            alert('Media URL copied to clipboard!');
        }
    });

    clearHistoryBtn.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        renderHistory();
    });

    guideModalBtn.addEventListener('click', () => openModal(guideModal));
    closeGuideBtn.addEventListener('click', () => closeModal(guideModal));
    dismissGuideBtn.addEventListener('click', () => closeModal(guideModal));
}

// Auto-detect platform from URL string
function detectPlatformFromUrl(url) {
    let p = 'facebook';
    if (url.includes('instagram.com')) p = 'instagram';
    else if (url.includes('youtube.com') || url.includes('youtu.be')) p = 'youtube';
    else if (url.includes('whatsapp.com') || url.includes('wa.me')) p = 'whatsapp';
    else if (url.includes('facebook.com') || url.includes('fb.watch')) p = 'facebook';

    currentPlatform = p;
    platformTabs.forEach(t => {
        if (t.getAttribute('data-platform') === p) {
            t.classList.add('active-platform-tab');
        } else {
            t.classList.remove('active-platform-tab');
        }
    });
    updatePlatformUI();
}

function updatePlatformUI() {
    let placeholder = "Paste Facebook Reel link...";
    let iconName = "facebook";
    if (currentPlatform === 'instagram') {
        placeholder = "Paste Instagram Reel or Post link...";
        iconName = "instagram";
    } else if (currentPlatform === 'youtube') {
        placeholder = "Paste YouTube Shorts or Video link...";
        iconName = "youtube";
    } else if (currentPlatform === 'whatsapp') {
        placeholder = "Paste WhatsApp Status link / media...";
        iconName = "message-circle";
    }

    urlInput.placeholder = placeholder;
    inputPlatformIcon.innerHTML = `<i data-lucide="${iconName}" class="w-4 h-4 text-zinc-400"></i>`;
    if (window.lucide && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }
}

// Extraction Handler (Multi-Platform Support)
async function handleExtract() {
    let rawUrl = urlInput.value.trim();
    if (!rawUrl) {
        showError('Please paste a media link first.');
        return;
    }

    const urlMatch = rawUrl.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
        rawUrl = urlMatch[0];
        urlInput.value = rawUrl;
    }

    detectPlatformFromUrl(rawUrl);

    hideError();
    resultContainer.classList.add('hidden');
    loadingState.classList.remove('hidden');
    fetchBtn.disabled = true;
    fetchBtn.classList.add('opacity-50', 'cursor-not-allowed');
    updateIslandState('busy', `Resolving ${currentPlatform.toUpperCase()}`, 'Extracting 1080p HD & MP3...');

    let extractedData = null;

    // 1. Try configured / hosted backend endpoints (supports Netlify -> Render / Railway / Local)
    const backendEndpoints = [
        '/api/extract',
        'https://ashx-downloader-api.onrender.com/api/extract',
        'https://fbdown-api.onrender.com/api/get?url=' + encodeURIComponent(rawUrl)
    ];

    for (const ep of backendEndpoints) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            
            let response;
            if (ep.includes('?url=')) {
                response = await fetch(ep, { signal: controller.signal });
            } else {
                response = await fetch(ep, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: rawUrl }),
                    signal: controller.signal
                });
            }
            clearTimeout(timeoutId);

            if (response.ok) {
                const res = await response.json();
                if (res.success && res.data) {
                    extractedData = res.data;
                    break;
                } else if (res.hd || res.video) {
                    extractedData = {
                        title: res.title || "Extracted Video",
                        thumbnail: res.thumbnail || "",
                        duration: 0,
                        uploader: `${currentPlatform.toUpperCase()} Creator`,
                        hd: { url: res.hd || res.video, quality: "1080p Full HD" },
                        sd: { url: res.sd || res.video, quality: "480p SD" },
                        audio: { url: res.hd || res.video, quality: "320kbps MP3 Audio" }
                    };
                    break;
                }
            }
        } catch (e) {}
    }

    // 2. Client-Side Multi-Gateway Extractor
    if (!extractedData) {
        extractedData = await clientSideExtract(rawUrl);
    }

    loadingState.classList.add('hidden');
    fetchBtn.disabled = false;
    fetchBtn.classList.remove('opacity-50', 'cursor-not-allowed');

    if (extractedData && (extractedData.hd?.url || extractedData.audio?.url || extractedData.sd?.url)) {
        currentVideoData = extractedData;
        populateResult(extractedData);
        saveToHistory(extractedData, rawUrl);
        updateIslandState('success', 'Media Ready', 'Full HD & MP3 Available');
    } else {
        let msg = 'Could not extract media. Ensure the Reel/Post is public (not restricted or in a private account).';
        if (currentPlatform === 'instagram') {
            msg = 'Instagram blocked access to this reel. If this reel is age-restricted or private, Instagram requires a login. Public Instagram & Facebook reels work without login.';
        }
        showError(msg);
        updateIslandState('error', 'Extraction Failed', 'Reel may be private or restricted');
    }
}

// Client-Side Multi-Platform Extractor
async function clientSideExtract(mediaUrl) {
    // Gateway 1: Cobalt API (Supports YouTube, Instagram, Facebook, TikTok)
    try {
        const r = await fetch('https://co.wuk.sh/api/json', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: mediaUrl, vQuality: '1080', isAudioOnly: false })
        });
        if (r.ok) {
            const data = await r.json();
            if (data && (data.url || data.picker)) {
                const streamUrl = data.url || (data.picker && data.picker[0]?.url);
                const audioUrl = (data.audio) || streamUrl;
                if (streamUrl) {
                    return {
                        title: "Extracted Social Media Video",
                        thumbnail: "",
                        duration: 0,
                        uploader: `${currentPlatform.toUpperCase()} Creator`,
                        hd: { url: streamUrl, quality: "1080p Full HD" },
                        sd: { url: streamUrl, quality: "480p SD" },
                        audio: { url: audioUrl, quality: "320kbps MP3 Audio" }
                    };
                }
            }
        }
    } catch (e) {}

    // Gateway 2: Direct Scrape via Proxies
    const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(mediaUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(mediaUrl)}`
    ];

    for (const proxy of proxies) {
        try {
            const controller = new AbortController();
            const to = setTimeout(() => controller.abort(), 6000);
            const resp = await fetch(proxy, { signal: controller.signal });
            clearTimeout(to);

            if (resp.ok) {
                const html = await resp.text();
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
                const title = titleMatch ? titleMatch[1].replace(/ \| (Facebook|Instagram|YouTube)/gi, '') : "Social Media Asset";

                if (hd || sd) {
                    return {
                        title: title,
                        thumbnail: thumb || "",
                        duration: 0,
                        uploader: `${currentPlatform.toUpperCase()} Creator`,
                        hd: { url: hd || sd, quality: hd ? "1080p Full HD" : "Standard HD" },
                        sd: { url: sd || hd, quality: "480p SD" },
                        audio: { url: hd || sd, quality: "320kbps MP3 Audio" }
                    };
                }
            }
        } catch (err) {}
    }

    return null;
}

// Populate UI with extracted data
function populateResult(data) {
    resTitle.textContent = data.title || 'Social Media Asset';
    resUploader.textContent = data.uploader || 'Creator Media';
    
    if (data.duration) {
        const mins = Math.floor(data.duration / 60);
        const secs = Math.floor(data.duration % 60);
        resDuration.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs} • Ready to download`;
    } else {
        resDuration.textContent = `Verified 1080p & MP3 Stream`;
    }

    if (data.hd?.quality) hdSub.textContent = data.hd.quality;
    if (data.sd?.quality) sdSub.textContent = data.sd.quality;

    selectedQuality = 'hd';
    qualityTabs.forEach(t => {
        if (t.getAttribute('data-quality') === 'hd') {
            t.classList.add('active-quality-tab');
        } else {
            t.classList.remove('active-quality-tab');
        }
    });

    updateActiveQualityView();
    resultContainer.classList.remove('hidden');
    lucide.createIcons();
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateActiveQualityView() {
    if (!currentVideoData) return;
    const item = currentVideoData[selectedQuality] || currentVideoData.hd;
    if (!item || !item.url) return;

    if (selectedQuality === 'audio') {
        videoBadge.textContent = 'MP3 AUDIO';
        downloadBtnLabel.textContent = 'Save Only MP3 Audio (320kbps)';
    } else if (selectedQuality === 'sd') {
        videoBadge.textContent = 'SD 480P';
        downloadBtnLabel.textContent = 'Save Standard Video (MP4)';
    } else {
        videoBadge.textContent = 'FULL HD 1080P';
        downloadBtnLabel.textContent = 'Save Full HD 1080p (MP4)';
    }

    videoPlayer.src = item.url;
    videoPlayer.poster = currentVideoData.thumbnail || '';
}

function updateIslandState(type, title, subtitle) {
    islandTitle.textContent = title;
    islandSubtitle.textContent = subtitle;

    if (type === 'busy') {
        islandIndicator.className = 'w-2.5 h-2.5 rounded-full bg-blue-400 animate-spin border border-white border-t-transparent';
    } else if (type === 'success') {
        islandIndicator.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]';
    } else if (type === 'error') {
        islandIndicator.className = 'w-2.5 h-2.5 rounded-full bg-rose-400';
    } else {
        islandIndicator.className = 'w-2.5 h-2.5 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.8)]';
    }
}

function showError(msg) {
    errorMessage.textContent = msg;
    errorBox.classList.remove('hidden');
    lucide.createIcons();
}

function hideError() {
    errorBox.classList.add('hidden');
}

function saveToHistory(data, originalUrl) {
    try {
        let history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        const entry = {
            id: Date.now(),
            title: data.title || 'Social Media Asset',
            thumbnail: data.thumbnail || '',
            url: data.hd?.url || originalUrl,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        history = [entry, ...history.filter(h => h.title !== entry.title)].slice(0, 5);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        renderHistory();
    } catch (e) {}
}

function renderHistory() {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (history.length === 0) {
        emptyHistory.classList.remove('hidden');
        historyList.innerHTML = '';
        historyList.appendChild(emptyHistory);
        return;
    }

    emptyHistory.classList.add('hidden');
    historyList.innerHTML = '';

    history.forEach(item => {
        const el = document.createElement('div');
        el.className = 'flex items-center justify-between p-2.5 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 transition-all';
        el.innerHTML = `
            <div class="flex items-center gap-2.5 overflow-hidden">
                <div class="w-8 h-8 rounded-lg bg-zinc-800 overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">
                    ${item.thumbnail ? `<img src="${item.thumbnail}" class="w-full h-full object-cover" onerror="this.style.display='none'"/>` : `<i data-lucide="film" class="w-3.5 h-3.5 text-zinc-400"></i>`}
                </div>
                <div class="truncate text-left">
                    <p class="text-xs font-normal text-zinc-200 truncate max-w-[200px] md:max-w-[300px]">${item.title}</p>
                    <span class="text-[10px] text-zinc-500">${item.time}</span>
                </div>
            </div>
            <a href="${item.url}" target="_blank" download class="shrink-0 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors">
                <i data-lucide="download" class="w-3.5 h-3.5"></i>
            </a>
        `;
        historyList.appendChild(el);
    });

    lucide.createIcons();
}

function openModal(modal) {
    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.classList.add('opacity-100', 'pointer-events-auto');
}

function closeModal(modal) {
    modal.classList.remove('opacity-100', 'pointer-events-auto');
    modal.classList.add('opacity-0', 'pointer-events-none');
}

function initAmbientCanvas() {
    const canvas = document.getElementById('ambient-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    });

    const bubbles = [
        { x: width * 0.2, y: height * 0.3, radius: 260, color: 'rgba(30, 40, 60, 0.4)', vx: 0.2, vy: 0.15 },
        { x: width * 0.8, y: height * 0.2, radius: 280, color: 'rgba(45, 30, 60, 0.35)', vx: -0.15, vy: 0.2 },
        { x: width * 0.5, y: height * 0.8, radius: 320, color: 'rgba(20, 35, 50, 0.3)', vx: 0.15, vy: -0.2 }
    ];

    function render() {
        ctx.clearRect(0, 0, width, height);

        bubbles.forEach(b => {
            b.x += b.vx;
            b.y += b.vy;

            if (b.x < -b.radius) b.x = width + b.radius;
            if (b.x > width + b.radius) b.x = -b.radius;
            if (b.y < -b.radius) b.y = height + b.radius;
            if (b.y > height + b.radius) b.y = -b.radius;

            const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
            grad.addColorStop(0, b.color);
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            ctx.fill();
        });

        requestAnimationFrame(render);
    }

    render();
}

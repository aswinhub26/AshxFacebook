// ==========================================================================
// AshxFacebook - Client Logic with iOS 26 Glass Effects
// ==========================================================================

let currentVideoData = null;
let selectedQuality = 'hd';
const STORAGE_KEY = 'ashx_fb_history_v1';

// DOM Elements
const urlInput = document.getElementById('reel-url-input');
const pasteBtn = document.getElementById('paste-btn');
const clearBtn = document.getElementById('clear-btn');
const fetchBtn = document.getElementById('fetch-btn');
const btnText = document.getElementById('btn-text');
const btnIcon = document.getElementById('btn-icon');
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
const hdSub = document.getElementById('hd-sub');
const sdSub = document.getElementById('sd-sub');

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
        // Extract URL if text contains other message text
        const match = sharedText.match(/https?:\/\/[^\s]+/);
        const targetUrl = match ? match[0] : sharedText;
        urlInput.value = targetUrl;
        clearBtn.classList.remove('hidden');
        handleExtract();
    }
});

function setupEventListeners() {
    // Input changes
    urlInput.addEventListener('input', () => {
        if (urlInput.value.trim().length > 0) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    });

    // Clear input
    clearBtn.addEventListener('click', () => {
        urlInput.value = '';
        clearBtn.classList.add('hidden');
        urlInput.focus();
    });

    // Clipboard Paste
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                urlInput.value = text.trim();
                clearBtn.classList.remove('hidden');
                updateIslandState('active', 'Link Pasted', 'Click Extract to fetch HD');
                // Auto trigger if it looks like a valid link
                if (text.includes('facebook.com') || text.includes('fb.watch')) {
                    handleExtract();
                }
            }
        } catch (err) {
            console.warn('Clipboard read error: ', err);
            urlInput.focus();
        }
    });

    // Extract Trigger
    fetchBtn.addEventListener('click', handleExtract);
    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleExtract();
        }
    });

    // Quality Tab Switching
    qualityTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            qualityTabs.forEach(t => t.classList.remove('active-quality-tab'));
            tab.classList.add('active-quality-tab');
            selectedQuality = tab.getAttribute('data-quality');
            updateActiveQualityView();
        });
    });

    // Copy Direct Link
    copyDirectLinkBtn.addEventListener('click', () => {
        if (!currentVideoData) return;
        const targetUrl = currentVideoData[selectedQuality]?.url || currentVideoData.hd?.url;
        if (targetUrl) {
            navigator.clipboard.writeText(targetUrl);
            const original = copyDirectLinkBtn.innerHTML;
            copyDirectLinkBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i><span class="text-emerald-300">Copied!</span>`;
            lucide.createIcons();
            setTimeout(() => {
                copyDirectLinkBtn.innerHTML = original;
                lucide.createIcons();
            }, 2000);
        }
    });

    // Share Button
    shareAppBtn.addEventListener('click', async () => {
        if (!currentVideoData) return;
        const targetUrl = currentVideoData[selectedQuality]?.url || currentVideoData.hd?.url;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: currentVideoData.title,
                    text: 'Saved with AshxFacebook HD Reel Saver',
                    url: targetUrl
                });
            } catch (err) {
                console.log('Share dismissed');
            }
        } else {
            navigator.clipboard.writeText(targetUrl);
            alert('Video URL copied to clipboard for sharing!');
        }
    });

    // History Clear
    clearHistoryBtn.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        renderHistory();
    });

    // Modal Guide
    guideModalBtn.addEventListener('click', () => openModal(guideModal));
    closeGuideBtn.addEventListener('click', () => closeModal(guideModal));
    dismissGuideBtn.addEventListener('click', () => closeModal(guideModal));
}

// Extraction Handler
async function handleExtract() {
    const rawUrl = urlInput.value.trim();
    if (!rawUrl) {
        showError('Please paste a Facebook Reel or Video link first.');
        return;
    }

    hideError();
    resultContainer.classList.add('hidden');
    loadingState.classList.remove('hidden');
    fetchBtn.disabled = true;
    fetchBtn.classList.add('opacity-70', 'cursor-not-allowed');
    updateIslandState('busy', 'Analyzing HD Stream', 'Connecting to Facebook server...');

    try {
        const response = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: rawUrl })
        });

        const data = await response.json();

        if (response.ok && data.success && data.data) {
            currentVideoData = data.data;
            populateResult(data.data);
            saveToHistory(data.data, rawUrl);
            updateIslandState('success', 'HD Video Ready', 'Click Download to save');
        } else {
            showError(data.error || 'Failed to extract video. Make sure the Reel is public.');
            updateIslandState('error', 'Extraction Failed', 'Reel may be private or invalid');
        }
    } catch (err) {
        showError('Network error connecting to extraction engine. Please try again.');
        updateIslandState('error', 'Network Error', 'Check connection');
    } finally {
        loadingState.classList.add('hidden');
        fetchBtn.disabled = false;
        fetchBtn.classList.remove('opacity-70', 'cursor-not-allowed');
    }
}

// Populate UI with extracted data
function populateResult(data) {
    resTitle.textContent = data.title || 'Facebook HD Reel Video';
    resUploader.innerHTML = `<i data-lucide="user" class="w-3.5 h-3.5"></i><span>${data.uploader || 'Facebook Creator'}</span>`;
    
    if (data.duration) {
        const mins = Math.floor(data.duration / 60);
        const secs = Math.floor(data.duration % 60);
        resDuration.innerHTML = `<i data-lucide="clock" class="w-3.5 h-3.5"></i><span>${mins}:${secs < 10 ? '0' : ''}${secs} • Ready to download</span>`;
    } else {
        resDuration.innerHTML = `<i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-400"></i><span>Stream Verified</span>`;
    }

    if (data.hd && data.hd.quality) hdSub.textContent = data.hd.quality;
    if (data.sd && data.sd.quality) sdSub.textContent = data.sd.quality;

    // Reset default quality to HD
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

    // Scroll smoothly to results
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateActiveQualityView() {
    if (!currentVideoData) return;
    const item = currentVideoData[selectedQuality] || currentVideoData.hd;
    if (!item) return;

    if (selectedQuality === 'audio') {
        videoBadge.textContent = 'MP3 AUDIO';
        downloadBtnLabel.textContent = 'Download Audio (MP3)';
    } else if (selectedQuality === 'sd') {
        videoBadge.textContent = 'SD 480P';
        downloadBtnLabel.textContent = 'Download SD Video (MP4)';
    } else {
        videoBadge.textContent = 'FULL HD 1080P';
        downloadBtnLabel.textContent = 'Download HD Video (MP4)';
    }

    // Update video player
    if (item.url) {
        videoPlayer.src = item.url;
        videoPlayer.poster = currentVideoData.thumbnail || '';
    }

    // Set download link pointing to streaming proxy
    const downloadProxyUrl = `/api/download?url=${encodeURIComponent(item.url)}&title=${encodeURIComponent(currentVideoData.title)}&quality=${selectedQuality.toUpperCase()}`;
    downloadTriggerBtn.href = downloadProxyUrl;
    downloadTriggerBtn.setAttribute('download', `AshxFacebook_${selectedQuality}.mp4`);
}

function updateIslandState(type, title, subtitle) {
    islandTitle.textContent = title;
    islandSubtitle.textContent = subtitle;

    dynamicIsland.className = 'transition-all duration-500 ease-spring flex items-center gap-3 px-5 py-2.5 rounded-full bg-black/60 backdrop-blur-3xl border shadow-2xl';

    if (type === 'busy') {
        dynamicIsland.classList.add('border-blue-500/50', 'shadow-[0_0_20px_rgba(59,130,246,0.4)]');
        islandIndicator.className = 'w-3 h-3 rounded-full bg-blue-400 animate-spin border-2 border-white border-t-transparent';
    } else if (type === 'success') {
        dynamicIsland.classList.add('border-emerald-500/50', 'shadow-[0_0_20px_rgba(52,211,153,0.4)]');
        islandIndicator.className = 'w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]';
    } else if (type === 'error') {
        dynamicIsland.classList.add('border-rose-500/50', 'shadow-[0_0_20px_rgba(244,63,94,0.4)]');
        islandIndicator.className = 'w-3 h-3 rounded-full bg-rose-400';
    } else {
        dynamicIsland.classList.add('border-white/20');
        islandIndicator.className = 'w-3 h-3 rounded-full bg-emerald-400 animate-pulse';
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

// History Management
function saveToHistory(data, originalUrl) {
    try {
        let history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        const entry = {
            id: Date.now(),
            title: data.title || 'Facebook HD Reel',
            thumbnail: data.thumbnail || '',
            url: data.hd?.url || originalUrl,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        // Avoid duplicate top items
        history = [entry, ...history.filter(h => h.title !== entry.title)].slice(0, 5);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        renderHistory();
    } catch (e) {
        console.warn('LocalStorage error:', e);
    }
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
        el.className = 'flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 backdrop-blur-xl transition-all';
        el.innerHTML = `
            <div class="flex items-center gap-3 overflow-hidden">
                <div class="w-10 h-10 rounded-xl bg-blue-600/30 overflow-hidden shrink-0 border border-white/15 flex items-center justify-center">
                    ${item.thumbnail ? `<img src="${item.thumbnail}" class="w-full h-full object-cover" onerror="this.style.display='none'"/>` : `<i data-lucide="film" class="w-4 h-4 text-blue-400"></i>`}
                </div>
                <div class="truncate text-left">
                    <p class="text-xs font-semibold text-white truncate max-w-[200px] md:max-w-[320px]">${item.title}</p>
                    <span class="text-[10px] text-white/40">${item.time} • HD Available</span>
                </div>
            </div>
            <a href="/api/download?url=${encodeURIComponent(item.url)}&title=${encodeURIComponent(item.title)}&quality=HD" download class="shrink-0 p-2 rounded-xl bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 transition-colors">
                <i data-lucide="download" class="w-4 h-4"></i>
            </a>
        `;
        historyList.appendChild(el);
    });

    lucide.createIcons();
}

// Modal Helpers
function openModal(modal) {
    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.classList.add('opacity-100', 'pointer-events-auto');
}

function closeModal(modal) {
    modal.classList.remove('opacity-100', 'pointer-events-auto');
    modal.classList.add('opacity-0', 'pointer-events-none');
}

// Liquid Glass Ambient Canvas Background Animation
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
        { x: width * 0.2, y: height * 0.3, radius: 260, color: 'rgba(30, 64, 175, 0.45)', vx: 0.3, vy: 0.2 },
        { x: width * 0.8, y: height * 0.2, radius: 280, color: 'rgba(91, 33, 182, 0.45)', vx: -0.25, vy: 0.3 },
        { x: width * 0.5, y: height * 0.8, radius: 320, color: 'rgba(14, 116, 144, 0.35)', vx: 0.2, vy: -0.25 },
        { x: width * 0.7, y: height * 0.6, radius: 220, color: 'rgba(139, 92, 246, 0.35)', vx: -0.3, vy: -0.2 }
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

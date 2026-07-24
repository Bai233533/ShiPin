/**
 * 视频无水印下载 - 前端交互逻辑
 */

// --- DOM Elements ---
const urlInput = document.getElementById('url-input');
const btnParse = document.getElementById('btn-parse');
const btnPaste = document.getElementById('btn-paste');
const btnClear = document.getElementById('btn-clear');

const loadingSection = document.getElementById('loading-section');
const loadingText = document.getElementById('loading-text');
const errorSection = document.getElementById('error-section');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const btnRetry = document.getElementById('btn-retry');

const resultSection = document.getElementById('result-section');
const videoThumbnail = document.getElementById('video-thumbnail');
const durationBadge = document.getElementById('duration-badge');
const platformTag = document.getElementById('platform-tag');
const videoTitle = document.getElementById('video-title');
const authorAvatar = document.getElementById('author-avatar');
const authorName = document.getElementById('author-name');
const authorUid = document.getElementById('author-uid');
const metaPlatform = document.getElementById('meta-platform');
const metaDuration = document.getElementById('meta-duration');
const metaQuality = document.getElementById('meta-quality');
const btnDownload = document.getElementById('btn-download');
const downloadProgress = document.getElementById('download-progress');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const statsRow = document.getElementById('stats-row');
const statLike = document.getElementById('stat-like');
const statComment = document.getElementById('stat-comment');
const statShare = document.getElementById('stat-share');
const musicInfo = document.getElementById('music-info');
const musicTitle = document.getElementById('music-title');
const btnDownloadAudio = document.getElementById('btn-download-audio');
const btnResultClose = document.getElementById('btn-result-close');

// --- State ---
let currentVideoData = null;
let isLoading = false;

// --- Event Listeners ---
btnParse.addEventListener('click', handleParse);
btnPaste.addEventListener('click', handlePaste);
btnClear.addEventListener('click', handleClear);
btnRetry.addEventListener('click', handleRetry);
btnDownload.addEventListener('click', handleDownload);
btnResultClose.addEventListener('click', handleRetry);

// Clear button visibility
urlInput.addEventListener('input', () => {
  if (urlInput.value.trim()) {
    btnClear.classList.add('visible');
  } else {
    btnClear.classList.remove('visible');
  }
});

// Enter key to parse (Ctrl+Enter)
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault();
    handleParse();
  }
});

// Auto-expand textarea
urlInput.addEventListener('input', () => {
  urlInput.style.height = 'auto';
  urlInput.style.height = Math.min(urlInput.scrollHeight, 160) + 'px';
});

// Audio download
btnDownloadAudio.addEventListener('click', () => {
  if (currentVideoData && currentVideoData.audioUrl) {
    downloadFile(currentVideoData.audioUrl, currentVideoData.musicTitle || 'music.mp3');
  }
});

// --- Handlers ---

/**
 * Paste from clipboard
 */
async function handlePaste() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      urlInput.value = text;
      urlInput.dispatchEvent(new Event('input'));
      btnClear.classList.add('visible');
      // Auto-trigger height adjustment
      urlInput.style.height = 'auto';
      urlInput.style.height = Math.min(urlInput.scrollHeight, 160) + 'px';
    }
  } catch (err) {
    // Clipboard API not available, show prompt
    urlInput.focus();
    showToast('请手动粘贴链接 (Ctrl+V)', 'info');
  }
}

/**
 * Clear input
 */
function handleClear() {
  urlInput.value = '';
  urlInput.style.height = 'auto';
  btnClear.classList.remove('visible');
  urlInput.focus();
}

/**
 * Retry / go back to input
 */
function handleRetry() {
  hideAll();
  urlInput.focus();
}

/**
 * Parse video URL
 */
async function handleParse() {
  const url = urlInput.value.trim();
  if (!url) {
    showToast('请先输入视频链接或分享文本', 'error');
    urlInput.focus();
    return;
  }

  if (isLoading) return;
  isLoading = true;

  // Show loading state
  hideAll();
  loadingSection.classList.remove('hidden');
  setLoadingText('正在解析视频链接...');

  // Disable parse button
  btnParse.disabled = true;
  btnParse.innerHTML = '<span class="btn-icon">⏳</span> 解析中...';

  try {
    setLoadingText('正在连接服务器...');
    await sleep(300);

    setLoadingText('正在识别平台...');
    await sleep(200);

    setLoadingText('正在获取视频信息...');

    const response = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || `服务器错误 (${response.status})`);
    }

    // Store data and show result
    currentVideoData = result.data;
    showResult(result.data);

  } catch (err) {
    showError(err.message || '解析失败，请检查链接或重试');
  } finally {
    isLoading = false;
    loadingSection.classList.add('hidden');
    btnParse.disabled = false;
    btnParse.innerHTML = '<span class="btn-icon">🔍</span> 解析视频';
  }
}

/**
 * Show result section
 */
function showResult(data) {
  resultSection.classList.remove('hidden');

  // Scroll to result
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Thumbnail - 防盗链图片走代理
  if (data.thumbnail) {
    let thumbUrl = data.thumbnail;
    // B站图片有防盗链，走后端代理
    if (thumbUrl.includes('hdslb.com') || thumbUrl.includes('douyincdn.com') ||
        thumbUrl.includes('kwimgs.com') || thumbUrl.includes('yximgs.com') || thumbUrl.includes('kwaicdn.com') ||
        thumbUrl.includes('xhscdn.com')) {
      thumbUrl = '/api/proxy-img?url=' + encodeURIComponent(thumbUrl);
    }
    videoThumbnail.src = thumbUrl;
    videoThumbnail.onerror = () => {
      videoThumbnail.src = 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" fill="%23e2e8f0"><rect width="400" height="225"/><text x="200" y="115" text-anchor="middle" fill="%2394a3b8" font-size="16">📹 无预览图</text></svg>'
      );
    };
  }

  // Duration badge
  if (data.duration > 0) {
    durationBadge.textContent = formatDuration(data.duration);
    durationBadge.classList.remove('hidden');
  } else {
    durationBadge.classList.add('hidden');
  }

  // Platform tag
  platformTag.textContent = data.platformName || '视频';

  // Title
  videoTitle.textContent = data.title || '无标题';

  // Author
  if (data.authorAvatar) {
    authorAvatar.src = data.authorAvatar;
    authorAvatar.onerror = () => { authorAvatar.style.display = 'none'; };
  }
  authorName.textContent = data.author || '未知';

  if (data.authorUid) {
    authorUid.textContent = '@' + data.authorUid;
    authorUid.classList.remove('hidden');
  } else {
    authorUid.classList.add('hidden');
  }

  // Meta
  metaPlatform.textContent = '📺 ' + (data.platformName || '视频');
  if (data.duration > 0) {
    metaDuration.textContent = '⏱ ' + formatDuration(data.duration);
    metaDuration.classList.remove('hidden');
  } else {
    metaDuration.classList.add('hidden');
  }
  if (data.quality) {
    metaQuality.textContent = '🎯 ' + data.quality;
    metaQuality.classList.remove('hidden');
  } else {
    metaQuality.classList.add('hidden');
  }

  // Stats
  if (data.stats) {
    statLike.textContent = '❤ ' + formatCount(data.stats.diggCount || data.stats.like || 0);
    statComment.textContent = '💬 ' + formatCount(data.stats.commentCount || data.stats.danmaku || 0);
    statShare.textContent = '🔄 ' + formatCount(data.stats.shareCount || data.stats.view || 0);
    statsRow.classList.remove('hidden');
  } else {
    statsRow.classList.add('hidden');
  }

  // Music info (Douyin)
  if (data.musicTitle || data.audioUrl) {
    musicTitle.textContent = data.musicTitle || '背景音乐';
    musicInfo.classList.remove('hidden');
  } else {
    musicInfo.classList.add('hidden');
  }

  // Reset download state
  downloadProgress.classList.add('hidden');
  btnDownload.classList.remove('hidden');
  btnDownload.disabled = false;
  btnDownload.innerHTML = '<span class="btn-icon">⬇</span> 下载无水印视频';
}

/**
 * Show error state
 */
function showError(message) {
  errorSection.classList.remove('hidden');
  errorTitle.textContent = '解析失败';
  errorMessage.textContent = message;

  // If yt-dlp not installed, add a hint
  if (message.includes('yt-dlp') || message.includes('未安装')) {
    errorMessage.innerHTML = message + '<br><br><small>提示：安装 yt-dlp 可支持更多平台<br><code>pip install yt-dlp</code></small>';
  }

  errorSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Hide all sections
 */
function hideAll() {
  loadingSection.classList.add('hidden');
  errorSection.classList.add('hidden');
  resultSection.classList.add('hidden');
  downloadProgress.classList.add('hidden');
  currentVideoData = null;
}

/**
 * Handle download
 */
async function handleDownload() {
  if (!currentVideoData || !currentVideoData.downloadUrl) {
    showToast('没有可下载的视频链接', 'error');
    return;
  }

  const downloadUrl = encodeURIComponent(currentVideoData.downloadUrl);
  const title = currentVideoData.title || 'video';
  const proxyUrl = `/api/download?url=${downloadUrl}&title=${encodeURIComponent(title)}`;

  // Show progress
  btnDownload.classList.add('hidden');
  downloadProgress.classList.remove('hidden');
  progressFill.style.width = '10%';
  progressText.textContent = '正在准备下载...';

  try {
    // Create hidden iframe for download to track progress
    const downloadFrame = document.createElement('iframe');
    downloadFrame.style.display = 'none';
    downloadFrame.src = proxyUrl;
    document.body.appendChild(downloadFrame);

    // Simulate progress
    progressFill.style.width = '30%';
    progressText.textContent = '正在连接服务器...';

    await sleep(500);
    progressFill.style.width = '60%';
    progressText.textContent = '正在传输视频...';

    await sleep(1000);
    progressFill.style.width = '90%';
    progressText.textContent = '下载完成！';

    await sleep(500);
    progressFill.style.width = '100%';
    progressText.textContent = '✅ 下载已开始，如未自动下载请尝试直接打开链接';

    // Clean up iframe after a while
    setTimeout(() => {
      if (downloadFrame.parentNode) {
        downloadFrame.parentNode.removeChild(downloadFrame);
      }
    }, 5000);

  } catch (err) {
    downloadProgress.classList.add('hidden');
    btnDownload.classList.remove('hidden');
    showToast('下载失败: ' + err.message, 'error');
  }
}

/**
 * Download file (for audio, etc.)
 */
function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Set loading text with delay for natural feel
 */
function setLoadingText(text) {
  loadingText.textContent = text;
}

// --- Toast Notification ---
function showToast(message, type = 'info') {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  const colors = {
    info: { bg: '#3b82f6', text: '#fff' },
    error: { bg: '#ef4444', text: '#fff' },
    success: { bg: '#10b981', text: '#fff' }
  };

  Object.assign(toast.style, {
    position: 'fixed',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: colors[type]?.bg || colors.info.bg,
    color: colors[type]?.text || colors.info.text,
    padding: '10px 24px',
    borderRadius: '8px',
    fontSize: '0.9rem',
    fontWeight: '500',
    zIndex: '9999',
    boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
    animation: 'slideDown 0.3s ease',
    maxWidth: '90vw',
    textAlign: 'center'
  });

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// --- Helpers ---
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatCount(num) {
  if (!num) return '0';
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿';
  if (num >= 10000) return (num / 10000).toFixed(1) + '万';
  return num.toLocaleString();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Init ---
console.log('🎬 视频无水印下载已就绪');
console.log('📋 支持的平台: 抖音 | 快手 | B站 | 小红书');
console.log('💡 提示: Ctrl+Enter 快速解析');

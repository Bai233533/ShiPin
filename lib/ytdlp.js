const { exec } = require('child_process');
const path = require('path');

/**
 * Parse video using yt-dlp (universal fallback)
 * Supports: YouTube, Instagram, Xigua, and any platform yt-dlp supports
 */
async function parseWithYtDlp(url) {
  return new Promise((resolve, reject) => {
    const cmd = `yt-dlp --no-warnings --no-check-certificate -j --print downloaded_file_path --no-download "${url}"`;

    const child = exec(cmd, {
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'en_US.UTF-8' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });

    child.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        reject(new Error('yt-dlp failed (exit code ' + code + '). Install: pip install yt-dlp'));
        return;
      }

      try {
        const lines = stdout.trim().split('\n');
        // Find the JSON line (yt-dlp outputs JSON first, then the file path)
        let jsonLine = null;
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line.trim());
            if (parsed.title && parsed.formats) {
              jsonLine = parsed;
              break;
            }
          } catch (e) {
            continue;
          }
        }

        if (!jsonLine) {
          reject(new Error('yt-dlp returned invalid data. Install: pip install yt-dlp'));
          return;
        }

        // Get the best video+audio format URL
        let downloadUrl = '';
        let bestFormat = null;
        const formats = jsonLine.formats || [];

        // Try to find best combined video+audio format
        for (const fmt of formats) {
          if (fmt.vcodec !== 'none' && fmt.acodec !== 'none') {
            if (!bestFormat || (fmt.filesize || 0) > (bestFormat.filesize || 0)) {
              bestFormat = fmt;
            }
          }
        }

        // If no combined format, get the best video-only + best audio
        if (!bestFormat) {
          let bestVideo = null;
          let bestAudio = null;

          for (const fmt of formats) {
            if (fmt.vcodec !== 'none' && (!bestVideo || (fmt.height || 0) > (bestVideo.height || 0))) {
              bestVideo = fmt;
            }
            if (fmt.vcodec === 'none' && fmt.acodec !== 'none' && (!bestAudio || (fmt.abr || 0) > (bestAudio.abr || 0))) {
              bestAudio = fmt;
            }
          }

          if (bestVideo) {
            downloadUrl = bestVideo.url || '';
          } else if (formats.length > 0) {
            const lastFormat = formats[formats.length - 1];
            downloadUrl = lastFormat.url || '';
          }
        } else {
          downloadUrl = bestFormat.url || '';
        }

        // Detect platform from extractor
        let platform = 'unknown';
        let platformName = '通用';
        const extractor = jsonLine.extractor_key || jsonLine.extractor || '';

        if (/douyin|tiktok/i.test(extractor)) {
          platform = 'douyin';
          platformName = '抖音';
        } else if (/kuaishou/i.test(extractor)) {
          platform = 'kuaishou';
          platformName = '快手';
        } else if (/bilibili/i.test(extractor)) {
          platform = 'bilibili';
          platformName = 'B站';
        } else if (/xiaohongshu|xhs/i.test(extractor)) {
          platform = 'xiaohongshu';
          platformName = '小红书';
        } else if (/weibo/i.test(extractor)) {
          platform = 'weibo';
          platformName = '微博';
        } else if (/youtube/i.test(extractor)) {
          platform = 'youtube';
          platformName = 'YouTube';
        } else if (/xigua/i.test(extractor)) {
          platform = 'xigua';
          platformName = '西瓜视频';
        } else if (/instagram/i.test(extractor)) {
          platform = 'instagram';
          platformName = 'Instagram';
        }

        resolve({
          platform: platform,
          platformName: platformName,
          title: jsonLine.title || '无标题',
          author: jsonLine.uploader || jsonLine.channel || '未知',
          authorAvatar: jsonLine.uploader_url || '',
          thumbnail: jsonLine.thumbnail || '',
          duration: jsonLine.duration ? Math.round(jsonLine.duration) : 0,
          downloadUrl: downloadUrl,
          quality: bestFormat ? `${bestFormat.width || ''}x${bestFormat.height || ''}` : '',
          webpageUrl: jsonLine.webpage_url || ''
        });
      } catch (e) {
        reject(new Error('Failed to parse yt-dlp output: ' + e.message));
      }
    });

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('yt-dlp not installed. Run: pip install yt-dlp'));
      } else {
        reject(new Error('yt-dlp error: ' + err.message));
      }
    });
  });
}

/**
 * Clean error message
 */
function cleanError(stderr) {
  if (!stderr) return '';
  const lines = stderr.split('\n').filter(l => l.trim());
  return lines[lines.length - 1]?.trim() || stderr.trim();
}

module.exports = { parseWithYtDlp };

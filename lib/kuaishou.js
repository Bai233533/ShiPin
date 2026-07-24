/**
 * 快手视频解析器 - 原生 fetch 实现
 * 
 * 快手页面结构特点：
 * 1. 短链需要 follow 重定向到 /short-video/ 或 m.gifshow.com
 * 2. 页面没有 window.__INITIAL_STATE__，但 HTML 中直接嵌入 photo 数据
 * 3. 通过正则提取 caption、userName、mainMvUrls、coverUrls 等字段
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'Referer': 'https://www.kuaishou.com/'
};

function extractUrl(input) {
  const match = input.match(/https?:\/\/[^\s,，。；;]+/);
  if (!match) throw new Error('无法识别链接');
  return match[0];
}

async function resolveShortUrl(url) {
  try {
    const response = await fetch(url, {
      headers: HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000)
    });
    return response.url || url;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('网络请求超时');
    throw e;
  }
}

function extractVideoId(url) {
  const patterns = [
    /\/photo\/([a-zA-Z0-9]+)/,
    /\/short-video\/([a-zA-Z0-9]+)/,
    /\/fw\/photo\/([a-zA-Z0-9]+)/,
    /\/fw\/video\/([a-zA-Z0-9]+)/,
    /\/video\/([a-zA-Z0-9]+)/
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/**
 * 从 HTML 中直接正则提取视频信息
 * 快手页面数据分散在 HTML 中，通过正则提取关键字段
 */
function extractVideoInfoFromHtml(html) {
  // caption（标题）
  const captionMatch = html.match(/"caption"\s*:\s*"([^"]+)"/);
  const caption = captionMatch ? captionMatch[1] : '';

  // userName（作者）
  const userNameMatch = html.match(/"userName"\s*:\s*"([^"]+)"/);
  const userName = userNameMatch ? userNameMatch[1] : '';

  // headUrl（头像）
  const headUrlMatch = html.match(/"headUrl"\s*:\s*"([^"]+)"/);
  const headUrl = headUrlMatch ? headUrlMatch[1] : '';

  // duration（时长，毫秒）
  const durationMatch = html.match(/"duration"\s*:\s*(\d+)/);
  const durationMs = durationMatch ? parseInt(durationMatch[1]) : 0;

  // mainMvUrls（视频地址数组）
  let videoUrl = '';
  const mvMatch = html.match(/"mainMvUrls"\s*:\s*(\[.+?\])/);
  if (mvMatch) {
    try {
      const urls = JSON.parse(mvMatch[1]);
      if (Array.isArray(urls) && urls.length > 0) {
        // 优先选择 kwimgs.com / yximgs.com 域名（可用性更高）
        const allUrls = urls.map(u => u.url || u || '').filter(Boolean);
        const preferred = allUrls.find(u => u.includes('kwimgs.com') || u.includes('yximgs.com'));
        videoUrl = preferred || allUrls[0] || '';
      }
    } catch (e) {
      // 如果 JSON 解析失败，尝试提取第一个 URL
      const urlMatch = mvMatch[1].match(/"url"\s*:\s*"([^"]+\.mp4[^"]*)"/);
      if (urlMatch) videoUrl = urlMatch[1];
    }
  }

  // 如果没有 mainMvUrls，尝试找页面中的 mp4 链接
  if (!videoUrl) {
    const mp4Match = html.match(/(https:\/\/[^\s"]+\.mp4[^\s"]*)/);
    if (mp4Match) videoUrl = mp4Match[1];
  }

  // coverUrls（封面数组）
  let coverUrl = '';
  const cvMatch = html.match(/"coverUrls"\s*:\s*(\[.+?\])/);
  if (cvMatch) {
    try {
      const covers = JSON.parse(cvMatch[1]);
      if (Array.isArray(covers) && covers.length > 0) {
        coverUrl = covers[0].url || covers[0] || '';
      }
    } catch (e) {
      const urlMatch = cvMatch[1].match(/"url"\s*:\s*"([^"]+)"/);
      if (urlMatch) coverUrl = urlMatch[1];
    }
  }

  // photo id
  const idMatch = html.match(/"id"\s*:\s*"([a-zA-Z0-9]+)"/);
  const photoId = idMatch ? idMatch[1] : '';

  return {
    caption, userName, headUrl, durationMs, videoUrl, coverUrl, photoId
  };
}

async function parseViaPage(url) {
  const response = await fetch(url, {
    headers: { ...HEADERS, 'Referer': 'https://www.kuaishou.com/' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000)
  });
  const html = await response.text();

  // 先尝试 __INITIAL_STATE__（旧版页面可能还有）
  const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});?\s*<\/script>/s);
  if (stateMatch) {
    try {
      const data = JSON.parse(stateMatch[1]);
      if (data.photo?.mainMvUrls) {
        const p = data.photo;
        return {
          platform: 'kuaishou',
          platformName: '快手',
          title: p.caption || '无标题',
          author: p.userName || '未知作者',
          authorAvatar: p.headUrl || '',
          thumbnail: p.coverUrls?.[0]?.url || '',
          duration: p.duration ? Math.round(p.duration / 1000) : 0,
          downloadUrl: p.mainMvUrls?.[0]?.url || '',
          videoId: p.id || ''
        };
      }
    } catch (e) {}
  }

  // 新版页面：直接正则提取
  const info = extractVideoInfoFromHtml(html);

  if (!info.videoUrl) {
    throw new Error('无法解析快手视频信息');
  }

  return {
    platform: 'kuaishou',
    platformName: '快手',
    title: info.caption || '无标题',
    author: info.userName || '未知作者',
    authorAvatar: info.headUrl || '',
    thumbnail: info.coverUrl || '',
    duration: info.durationMs ? Math.round(info.durationMs / 1000) : 0,
    downloadUrl: info.videoUrl,
    videoId: info.photoId || extractVideoId(response.url) || ''
  };
}

async function parseKuaishou(input) {
  const url = extractUrl(input);
  console.log('[快手] 解析链接:', url);

  let resolvedUrl = url;
  if (/v\.kuaishou\.com|kuaishou\.com\/f\//.test(url)) {
    try {
      resolvedUrl = await resolveShortUrl(url);
      console.log('[快手] 重定向到:', resolvedUrl);
    } catch (e) {}
  }

  const videoId = extractVideoId(resolvedUrl);
  console.log('[快手] 视频ID:', videoId);

  // 优先用干净的 URL（不带分享参数）解析，获取通用 CDN 地址
  const cleanUrls = [];
  if (videoId) {
    cleanUrls.push(`https://m.gifshow.com/fw/photo/${videoId}`);
    cleanUrls.push(`https://www.kuaishou.com/short-video/${videoId}`);
  }
  cleanUrls.push(resolvedUrl); // 最后尝试原始 URL

  for (const pageUrl of cleanUrls) {
    try {
      const result = await parseViaPage(pageUrl);
      if (result?.downloadUrl) {
        console.log('[快手] 解析成功 ✅');
        return result;
      }
    } catch (e) {
      console.log('[快手] 页面解析失败:', pageUrl.substring(0, 60), '-', e.message);
    }
  }

  const { parseWithYtDlp } = require('./ytdlp');
  return await parseWithYtDlp(resolvedUrl);
}

module.exports = { parseKuaishou };

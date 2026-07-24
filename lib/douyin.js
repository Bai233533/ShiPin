/**
 * 抖音视频解析器 - 原生 fetch 实现
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
};

/**
 * 从分享文本中提取 URL
 */
function extractUrl(input) {
  const match = input.match(/https?:\/\/[^\s,，。；;]+/);
  if (!match) throw new Error('无法识别链接，请检查输入的分享文本');
  return match[0];
}

/**
 * 跟踪短链接跳转，获取视频 ID
 * 使用 redirect: 'follow'，从 response.url 获取最终 URL
 */
async function resolveShortUrl(url) {
  try {
    const response = await fetch(url, {
      headers: HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000)
    });

    const finalUrl = response.url;
    console.log('[抖音] 短链最终URL:', finalUrl);

    // 检查最终 URL 是否包含视频信息
    if (finalUrl.includes('/video/') || finalUrl.includes('/note/') ||
        finalUrl.includes('modal_id=') || finalUrl.includes('item_id=') ||
        finalUrl.includes('aweme_id=')) {
      return finalUrl;
    }

    // 如果跳转到首页，可能是短链过期
    if (finalUrl === 'https://www.douyin.com/' || finalUrl === 'https://www.douyin.com/home') {
      // 尝试从 HTML 中解析（某些情况下页面会包含视频信息）
      const html = await response.text();

      // 尝试匹配 window._SSR_HYDRATED_DATA
      const ssrMatch = html.match(/window\._SSR_HYDRATED_DATA\s*=\s*({.+?});?\s*<\/script>/s);
      if (ssrMatch) {
        try {
          const data = JSON.parse(ssrMatch[1]);
          const itemId = data?.app?.initialState?.routeInitialState?.itemId;
          if (itemId) {
            return `https://www.douyin.com/video/${itemId}`;
          }
        } catch (e) {}
      }

      // 尝试从页面中的链接匹配视频 ID
      const videoIdMatch = html.match(/\/video\/(\d+)/);
      if (videoIdMatch) {
        return `https://www.douyin.com/video/${videoIdMatch[1]}`;
      }

      throw new Error('该链接已过期或无效，请从抖音APP重新分享获取新链接');
    }

    return finalUrl;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('网络请求超时');
    throw error;
  }
}

/**
 * 从 URL 中提取视频 ID
 */
function extractVideoId(url) {
  const patterns = [
    /\/video\/(\d+)/,
    /\/note\/(\d+)/,
    /share\/video\/(\w+)/,
    /modal_id=(\d+)/,
    /item_id=(\d+)/,
    /aweme_id=(\w+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * 方法 1: 通过 iesdouyin API 解析
 */
async function parseViaIesdouyinApi(videoId) {
  const apiUrl = `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${videoId}`;

  const response = await fetch(apiUrl, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) throw new Error(`API 返回 ${response.status}`);

  const data = await response.json();
  const item = data?.item_list?.[0];
  if (!item) throw new Error('API 返回数据为空');

  const video = item.video;
  const author = item.author;
  const music = item.music;

  // 获取无水印地址：将 playwm 替换为 play
  const videoUrls = video?.play_addr?.url_list || [];
  const noWatermarkUrls = videoUrls.map(u => u.replace('playwm', 'play'));

  const thumbnail = video?.origin_cover?.url_list?.[0]
    || video?.cover?.url_list?.[0]
    || video?.dynamic_cover?.url_list?.[0];

  const audioUrl = music?.play_url?.url_list?.[0] || '';

  return {
    platform: 'douyin',
    platformName: '抖音',
    title: item.desc || item.share_info?.share_title || '无标题',
    author: author?.nickname || '未知作者',
    authorUid: author?.unique_id || '',
    authorAvatar: author?.avatar_thumb?.url_list?.[0] || author?.avatar_medium?.url_list?.[0] || '',
    thumbnail: thumbnail || '',
    duration: video?.duration ? Math.round(video.duration / 1000) : 0,
    downloadUrl: noWatermarkUrls[0] || videoUrls[0] || '',
    downloadUrls: noWatermarkUrls,
    audioUrl: audioUrl || '',
    videoId: item.aweme_id || videoId,
    musicTitle: music?.title || '',
    stats: {
      diggCount: item.statistics?.digg_count || 0,
      commentCount: item.statistics?.comment_count || 0,
      shareCount: item.statistics?.share_count || 0
    }
  };
}

/**
 * JSON 中的 Unicode 解码
 */
function decodeUnicode(str) {
  return str.replace(/\\u([\dA-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * 从 ROUTER_DATA 中提取视频信息（支持新旧两种结构）
 */
function extractVideoFromRouterData(data) {
  if (!data || typeof data !== 'object') return null;

  // 直接检查是否是视频 item 对象
  if (data.aweme_id && data.video) {
    return buildVideoResult(data);
  }

  // 路径: videoInfoRes.item_list[0]
  if (data.videoInfoRes?.item_list) {
    const item = Array.isArray(data.videoInfoRes.item_list)
      ? data.videoInfoRes.item_list[0]
      : data.videoInfoRes.item_list;
    if (item?.aweme_id && item?.video) {
      return buildVideoResult(item);
    }
  }

  // 路径: loaderData["video_(id)/page"].videoInfoRes
  if (data.loaderData) {
    const loaderData = data.loaderData;
    for (const key of Object.keys(loaderData)) {
      if (key.includes('video') || key.includes('page')) {
        const found = extractVideoFromRouterData(loaderData[key]);
        if (found) return found;
      }
    }
  }

  // 递归搜索数组
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = extractVideoFromRouterData(item);
      if (found) return found;
    }
  }

  return null;
}

/**
 * 从 item 对象构建统一的视频结果
 */
function buildVideoResult(item) {
  const video = item.video;
  const urls = video?.play_addr?.url_list || video?.playAddr?.urlList || [];
  const noWatermarkUrls = urls.map(u => u.replace('playwm', 'play'));

  return {
    platform: 'douyin',
    platformName: '抖音',
    title: item.desc || item.share_info?.share_title || '无标题',
    author: item.author?.nickname || item.authorName || '未知作者',
    authorUid: item.author?.unique_id || '',
    authorAvatar: item.author?.avatar_thumb?.url_list?.[0] || '',
    thumbnail: video?.cover?.url_list?.[0] || video?.origin_cover?.url_list?.[0] || '',
    duration: video?.duration ? Math.round(video.duration / 1000) : 0,
    downloadUrl: noWatermarkUrls[0] || urls[0] || '',
    videoId: item.aweme_id
  };
}

/**
 * 从 HTML 文本中提取括号匹配的 JSON
 */
function extractBracketJson(html, startMarker) {
  const idx = html.indexOf(startMarker);
  if (idx === -1) return null;

  const start = html.indexOf('{', idx);
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) {
        return html.substring(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * 方法 2: 解析分享页面 HTML
 */
async function parseViaSharePage(videoId) {
  const pageUrl = `https://www.iesdouyin.com/share/video/${videoId}/`;

  const response = await fetch(pageUrl, {
    headers: {
      ...HEADERS,
      'Referer': 'https://www.douyin.com/'
    },
    signal: AbortSignal.timeout(15000)
  });

  const html = await response.text();

  // 方法 2a: 提取 _ROUTER_DATA 中的 videoInfoRes
  const routerData = extractBracketJson(html, 'window._ROUTER_DATA');
  if (routerData) {
    try {
      const data = JSON.parse(routerData);
      const videoData = extractVideoFromRouterData(data);
      if (videoData) return videoData;
    } catch (e) {
      console.log('[抖音] ROUTER_DATA JSON 解析失败:', e.message);
    }
  }

  // 方法 2b: 直接从页面中提取包含 item_list 的 JSON 数据块
  // 抖音新版本把 videoInfoRes 嵌入在 script 或内联中
  const itemListMatch = html.match(/"item_list"\s*:\s*\[([^\]]*?"aweme_id"\s*:\s*"[^"]+")/s);
  if (itemListMatch) {
    const jsonBlock = extractBracketJson(html, 'videoInfoRes');
    if (jsonBlock) {
      try {
        const data = JSON.parse(jsonBlock);
        const item = data?.item_list?.[0];
        if (item?.aweme_id && item?.video) {
          return buildVideoResult(item);
        }
      } catch (e) {}
    }
  }

  // 方法 2c: 老版本 SSR_HYDRATED_DATA
  const ssrMatch = html.match(/<script[^>]*id="[^"]*SSR[^"]*"[^>]*>([^<]+)<\/script>/s);
  if (ssrMatch) {
    try {
      const decoded = decodeUnicode(ssrMatch[1]);
      const data = JSON.parse(decoded);
      const firstKey = Object.keys(data?.post || {})[0];
      if (firstKey) {
        const post = data.post[firstKey];
        if (post?.video) {
          const urls = post.video?.play_addr?.url_list || [];
          const noWatermarkUrls = urls.map(u => u.replace('playwm', 'play'));
          return {
            platform: 'douyin',
            platformName: '抖音',
            title: post.desc || '无标题',
            author: post.author?.nickname || '未知作者',
            authorAvatar: post.author?.avatar_thumb?.url_list?.[0] || '',
            thumbnail: post.video?.cover?.url_list?.[0] || '',
            duration: post.video?.duration ? Math.round(post.video.duration / 1000) : 0,
            downloadUrl: noWatermarkUrls[0] || '',
            videoId: post.aweme_id || videoId
          };
        }
      }
    } catch (e) {}
  }

  throw new Error('无法从页面获取视频信息');
}

/**
 * 抖音主解析入口
 */
async function parseDouyin(input) {
  const url = extractUrl(input);
  console.log('[抖音] 解析链接:', url);

  // 解析短链接
  let resolvedUrl = url;
  if (url.includes('v.douyin.com') || url.includes('iesdouyin.com/share/')) {
    try {
      resolvedUrl = await resolveShortUrl(url);
      console.log('[抖音] 重定向到:', resolvedUrl);
    } catch (e) {
      console.log('[抖音] 重定向失败:', e.message);
      throw e;
    }
  }

  // 提取视频 ID
  const videoId = extractVideoId(resolvedUrl);
  if (!videoId) {
    throw new Error('无法获取视频ID，请检查链接是否有效或已过期');
  }
  console.log('[抖音] 视频ID:', videoId);

  // 尝试多种解析方式
  const methods = [parseViaIesdouyinApi, parseViaSharePage];

  for (const method of methods) {
    try {
      const result = await method(videoId);
      if (result?.downloadUrl) {
        console.log('[抖音] 解析成功');
        return result;
      }
    } catch (e) {
      console.log('[抖音] 方法失败:', e.message);
    }
  }

  // yt-dlp 兜底
  try {
    const { parseWithYtDlp } = require('./ytdlp');
    console.log('[抖音] 尝试 yt-dlp 解析');
    return await parseWithYtDlp(resolvedUrl);
  } catch (e) {
    throw new Error('抖音视频解析失败，该视频可能已被删除或设为私密');
  }
}

module.exports = { parseDouyin, extractUrl };

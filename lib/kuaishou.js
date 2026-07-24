/**
 * 快手视频解析器 - ES Module 版
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

function extractVideoInfoFromHtml(html) {
  const captionMatch = html.match(/"caption"\s*:\s*"([^"]+)"/);
  const caption = captionMatch ? captionMatch[1] : '';

  const userNameMatch = html.match(/"userName"\s*:\s*"([^"]+)"/);
  const userName = userNameMatch ? userNameMatch[1] : '';

  const headUrlMatch = html.match(/"headUrl"\s*:\s*"([^"]+)"/);
  const headUrl = headUrlMatch ? headUrlMatch[1] : '';

  const durationMatch = html.match(/"duration"\s*:\s*(\d+)/);
  const durationMs = durationMatch ? parseInt(durationMatch[1]) : 0;

  let videoUrl = '';
  const mvMatch = html.match(/"mainMvUrls"\s*:\s*(\[.+?\])/);
  if (mvMatch) {
    try {
      const urls = JSON.parse(mvMatch[1]);
      if (Array.isArray(urls) && urls.length > 0) {
        const allUrls = urls.map(u => u.url || u || '').filter(Boolean);
        const preferred = allUrls.find(u => u.includes('kwimgs.com') || u.includes('yximgs.com'));
        videoUrl = preferred || allUrls[0] || '';
      }
    } catch (e) {
      const urlMatch = mvMatch[1].match(/"url"\s*:\s*"([^"]+\.mp4[^"]*)"/);
      if (urlMatch) videoUrl = urlMatch[1];
    }
  }

  if (!videoUrl) {
    const mp4Match = html.match(/(https:\/\/[^\s"]+\.mp4[^\s"]*)/);
    if (mp4Match) videoUrl = mp4Match[1];
  }

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

export async function parseKuaishou(input) {
  const url = extractUrl(input);

  let resolvedUrl = url;
  if (/v\.kuaishou\.com|kuaishou\.com\/f\//.test(url)) {
    try {
      resolvedUrl = await resolveShortUrl(url);
    } catch (e) {}
  }

  const videoId = extractVideoId(resolvedUrl);

  const cleanUrls = [];
  if (videoId) {
    cleanUrls.push(`https://m.gifshow.com/fw/photo/${videoId}`);
    cleanUrls.push(`https://www.kuaishou.com/short-video/${videoId}`);
  }
  cleanUrls.push(resolvedUrl);

  for (const pageUrl of cleanUrls) {
    try {
      const result = await parseViaPage(pageUrl);
      if (result?.downloadUrl) {
        return result;
      }
    } catch (e) {}
  }

  throw new Error('快手视频解析失败，该视频可能已被删除或设为私密');
}

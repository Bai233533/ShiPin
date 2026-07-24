/**
 * B站视频解析器 - ES Module 版
 * 修复: redirect: 'manual' 改为 'follow'（Cloudflare Workers 不支持 manual）
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.bilibili.com/',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9'
};

function extractVideoId(input) {
  const match = input.match(/https?:\/\/[^\s,，。；;]+/);
  const url = match?.[0] || input;

  const bvMatch = url.match(/\/video\/(BV[0-9a-zA-Z]+)/);
  if (bvMatch) return { bvid: bvMatch[1] };

  const avMatch = url.match(/\/video\/av(\d+)/i);
  if (avMatch) return { avid: parseInt(avMatch[1]) };

  if (/b23\.tv|bili2233\.cn/.test(url)) return { shortUrl: url };
  throw new Error('无法识别B站链接');
}

/**
 * 短链展开 - 使用 redirect: 'follow' 从 response.url 获取最终地址
 * （Cloudflare Workers 的 redirect: 'manual' 返回 opaqueredirect 无法读取 location header）
 */
async function resolveShortUrl(shortUrl) {
  const response = await fetch(shortUrl, {
    headers: HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(10000)
  });
  const finalUrl = response.url;
  const bvMatch = finalUrl.match(/\/video\/(BV[0-9a-zA-Z]+)/);
  const avMatch = finalUrl.match(/\/video\/av(\d+)/i);
  if (bvMatch) return { bvid: bvMatch[1] };
  if (avMatch) return { avid: parseInt(avMatch[1]) };
  throw new Error('无法解析B站短链接');
}

async function getVideoInfo(bvid, avid) {
  const query = bvid ? `bvid=${bvid}` : `aid=${avid}`;
  const response = await fetch(`https://api.bilibili.com/x/web-interface/view?${query}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(10000)
  });
  const data = await response.json();
  if (data.code !== 0) throw new Error(data.message || '获取视频信息失败');
  return data.data;
}

async function getPlayUrl(bvid, cid) {
  const url = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&fnval=16&fnver=0&fourk=1`;

  const response = await fetch(url, {
    headers: { ...HEADERS, 'Referer': `https://www.bilibili.com/video/${bvid}` },
    signal: AbortSignal.timeout(10000)
  });
  const result = await response.json();
  if (result.code !== 0) throw new Error(result.message || '获取播放地址失败');

  const data = result.data;
  let bestUrl = '';
  let bestQuality = '';

  if (data.dash?.video?.length) {
    const sorted = [...data.dash.video].sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
    bestUrl = sorted[0].baseUrl || sorted[0].base_url || '';
    bestQuality = sorted[0].id || '';
  }

  if (!bestUrl && data.durl?.length) {
    const best = [...data.durl].sort((a, b) => (b.size || 0) - (a.size || 0))[0];
    bestUrl = best.url || '';
  }

  return { url: bestUrl, quality: bestQuality };
}

export async function parseBilibili(input) {
  let videoId = extractVideoId(input);
  if (videoId.shortUrl) {
    videoId = await resolveShortUrl(videoId.shortUrl);
  }

  const { bvid, avid } = videoId;

  const info = await getVideoInfo(bvid, avid);
  const cid = info.cid || info.pages?.[0]?.cid;
  if (!cid) throw new Error('无法获取视频分P信息');

  const playInfo = await getPlayUrl(bvid, cid);

  return {
    platform: 'bilibili',
    platformName: 'B站',
    title: info.title || '无标题',
    author: info.owner?.name || '未知UP主',
    authorAvatar: info.owner?.face || '',
    thumbnail: info.pic || '',
    duration: info.duration ? Math.round(info.duration) : 0,
    downloadUrl: playInfo.url || '',
    quality: playInfo.quality || '',
    bvid: info.bvid || bvid,
    avid: info.aid,
    cid,
    stats: {
      view: info.stat?.view || 0,
      danmaku: info.stat?.danmaku || 0,
      like: info.stat?.like || 0,
      coin: info.stat?.coin || 0,
      favorite: info.stat?.favorite || 0
    }
  };
}

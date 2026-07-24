/**
 * 小红书视频解析器 - 原生 fetch 实现
 * 
 * 小红书反爬较严，需要：
 * 1. 使用 /explore/ 路径 + xsec_token（分享链接自带）
 * 2. 完整的 Chrome headers 伪装
 * 3. 解析 video.mediaV2 JSON 字符串获取视频地址
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Referer': 'https://www.xiaohongshu.com/explore'
};

function extractUrl(input) {
  const match = input.match(/https?:\/\/[^\s,，。；;]+/);
  if (!match) throw new Error('无法识别链接');
  return match[0];
}

function extractNoteId(url) {
  const patterns = [/\/explore\/([a-zA-Z0-9]+)/, /\/discovery\/item\/([a-zA-Z0-9]+)/, /\/note\/([a-zA-Z0-9]+)/];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/**
 * 从 URL 中提取 xsec_token（绕过反爬的关键）
 */
function extractXsecToken(url) {
  const m = url.match(/xsec_token=([^&]+)/);
  return m ? m[1] : null;
}

/**
 * 构建带 xsec_token 的 explore 页面 URL
 */
function buildExploreUrl(noteId, originalUrl) {
  const xsecToken = extractXsecToken(originalUrl);
  let exploreUrl = `https://www.xiaohongshu.com/explore/${noteId}`;
  if (xsecToken) {
    exploreUrl += `?xsec_token=${xsecToken}&xsec_source=pc_share`;
  }
  return exploreUrl;
}

/**
 * 从 video 对象中提取视频 URL（兼容新旧格式）
 */
function extractVideoUrl(videoData) {
  if (!videoData) return null;

  // 新格式：mediaV2 是 JSON 字符串
  if (videoData.mediaV2 && typeof videoData.mediaV2 === 'string') {
    try {
      const mediaV2 = JSON.parse(videoData.mediaV2);
      // 直接从 opaque1 中取
      const screencast = mediaV2?.video?.opaque1?.default_screencast_stream;
      if (screencast) return screencast;

      // 从 stream_types 构造
      const streamTypes = mediaV2?.video?.stream_types || [];
      if (streamTypes.length > 0) {
        const bizId = mediaV2?.video?.biz_id || '';
        // 尝试 h264 或其他格式
        return null; // 优先用 screencast
      }
    } catch (e) {
      console.log('[小红书] mediaV2 解析失败:', e.message);
    }
  }

  // 旧格式：media.stream.h264
  if (videoData.media?.stream?.h264?.length) {
    const h264Urls = videoData.media.stream.h264.map(v => v.masterUrl || '').filter(Boolean);
    if (h264Urls[0]) return h264Urls[0];
  }

  // h265 回退
  if (videoData.media?.stream?.h265?.length) {
    return videoData.media.stream.h265[0]?.masterUrl || null;
  }

  return null;
}

/**
 * 从页面 HTML 中提取视频信息
 */
async function parseViaPage(resolvedUrl, noteId) {
  const pageUrl = buildExploreUrl(noteId, resolvedUrl);
  console.log('[小红书] 页面请求:', pageUrl);

  const response = await fetch(pageUrl, {
    headers: HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(15000)
  });

  const html = await response.text();
  console.log('[小红书] 页面大小:', html.length, '状态:', response.status);

  // 检查是否被反爬（302到安全验证页）或404
  if (html.length < 500) {
    throw new Error('小红书返回空页面，可能触发了安全验证');
  }
  // 检查 URL 是否被重定向到安全页面
  if (response.url && /\/sec_[\w]+/.test(response.url)) {
    throw new Error('小红书安全验证拦截，请稍后重试或使用其他链接');
  }
  const errMatch = html.match(/error_code[=:](\d+)/);
  if (errMatch && ['300031', '300012', '300013'].includes(errMatch[1])) {
    const errMsgMatch = html.match(/error_msg=([^&"]+)/);
    const errMsg = errMsgMatch ? decodeURIComponent(errMsgMatch[1]) : '未知错误';
    throw new Error('小红书: ' + errMsg);
  }

  // 方法1：__INITIAL_STATE__
  const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.+?\})\s*<\/script>/s);
  if (stateMatch) {
    try {
      const jsonStr = stateMatch[1].replace(/undefined/g, 'null');
      const data = JSON.parse(jsonStr);

      // 新版路径：noteDetailMap[noteId].note
      const ndm = data.note?.noteDetailMap || data.noteDetailMap;
      if (ndm) {
        const noteKey = Object.keys(ndm)[0];
        const note = ndm[noteKey]?.note;
        if (note) {
          // 检查是否是视频
          if (note.type !== 'video' && !note.video) {
            throw new Error('该笔记不是视频类型（可能是图文）');
          }

          const videoUrl = extractVideoUrl(note.video);
          if (videoUrl) {
            const user = note.user || {};
            return {
              platform: 'xiaohongshu',
              platformName: '小红书',
              title: note.title || note.desc || '无标题',
              author: user.nickname || user.nickName || '未知作者',
              authorUid: user.userId || user.redId || '',
              authorAvatar: user.avatar || user.images || '',
              thumbnail: note.video?.image?.url_default || note.video?.image?.urlDefault || note.video?.image?.url || note.imageList?.[0]?.url_default || note.imageList?.[0]?.urlDefault || note.imageList?.[0]?.url || '',
              duration: note.video?.media?.stream?.duration || note.video?.mediaV2 ? 0 : 0,
              downloadUrl: videoUrl,
              noteId: note.noteId || noteId
            };
          }
        }
      }

      // 旧版路径递归搜索（兼容）
      const oldNote = findNoteDataLegacy(data);
      if (oldNote?.video?.media?.stream) {
        const stream = oldNote.video.media.stream;
        const h264Urls = (stream.h264 || []).map(v => v.masterUrl || '').filter(Boolean);
        const user = oldNote.user || {};
        return {
          platform: 'xiaohongshu', platformName: '小红书',
          title: oldNote.title || oldNote.desc || '无标题',
          author: user.nickname || user.nickName || '未知作者',
          authorAvatar: user.avatar || user.images || '',
          thumbnail: oldNote.cover?.url_default || oldNote.cover?.url || stream.image?.url_default || '',
          duration: stream.duration ? Math.round(stream.duration) : 0,
          downloadUrl: h264Urls[0] || (stream.h265 || [])[0]?.masterUrl || '',
          noteId: oldNote.note_id || oldNote.id || noteId
        };
      }
    } catch (e) {
      console.log('[小红书] INITIAL_STATE 解析异常:', e.message);
    }
  }

  // 方法2：og:video 元标签（无视频时的文本内容）
  const ogVideoMatch = html.match(/<meta[^>]*property="og:video"[^>]*content="([^"]+)"/);
  const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/);
  const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);

  if (ogVideoMatch && ogVideoMatch[1] && ogVideoMatch[1] !== '00:33') {
    return {
      platform: 'xiaohongshu', platformName: '小红书',
      title: ogTitleMatch?.[1]?.replace(' - 小红书', '') || '无标题',
      author: '小红书用户',
      thumbnail: (ogImageMatch?.[1] || '').startsWith('//') ? 'https:' + ogImageMatch[1] : (ogImageMatch?.[1] || ''),
      duration: 0, downloadUrl: ogVideoMatch[1],
      noteId
    };
  }

  throw new Error('无法解析小红书视频，请确保链接包含视频内容');
}

/**
 * 旧版递归搜索（兼容老格式）
 */
function findNoteDataLegacy(data, depth = 0) {
  if (depth > 10 || !data || typeof data !== 'object') return null;
  if (data.note_id && data.video) return data;
  if (data.noteId && data.video) return { ...data, note_id: data.noteId };
  if (data.noteDetailMap) {
    const key = Object.keys(data.noteDetailMap)[0];
    if (key && data.noteDetailMap[key]?.note) return data.noteDetailMap[key].note;
  }
  if (data.note) return findNoteDataLegacy(data.note, depth + 1);
  if (data.noteDetail) return findNoteDataLegacy(data.noteDetail, depth + 1);
  return null;
}

async function parseXiaohongshu(input) {
  const url = extractUrl(input);
  console.log('[小红书] 原始链接:', url);

  // xhslink 短链（xhslink.com / xhslink.cn）需要先展开
  let resolvedUrl = url;
  if (url.includes('xhslink.com') || url.includes('xhslink.cn') || url.includes('xh5.link')) {
    try {
      console.log('[小红书] 展开短链:', url);
      const r = await fetch(url, {
        headers: HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(15000)
      });
      resolvedUrl = r.url || url;
      console.log('[小红书] 展开后:', resolvedUrl);
    } catch (e) {
      console.log('[小红书] 短链展开失败:', e.message);
    }
  }

  const noteId = extractNoteId(resolvedUrl);
  if (!noteId) throw new Error('无法识别小红书笔记ID（链接可能已过期）');
  console.log('[小红书] 笔记ID:', noteId);

  // 优先使用页面解析
  try {
    const result = await parseViaPage(resolvedUrl, noteId);
    if (result?.downloadUrl) {
      console.log('[小红书] 解析成功');
      return result;
    }
  } catch (e) {
    console.log('[小红书] 页面解析失败:', e.message);
    throw e;  // 直接抛出，不回退 yt-dlp（未安装）
  }
}

module.exports = { parseXiaohongshu };

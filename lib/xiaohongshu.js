/**
 * 小红书视频解析器 - ES Module 版
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

function extractXsecToken(url) {
  const m = url.match(/xsec_token=([^&]+)/);
  return m ? m[1] : null;
}

function buildExploreUrl(noteId, originalUrl) {
  const xsecToken = extractXsecToken(originalUrl);
  let exploreUrl = `https://www.xiaohongshu.com/explore/${noteId}`;
  if (xsecToken) {
    exploreUrl += `?xsec_token=${xsecToken}&xsec_source=pc_share`;
  }
  return exploreUrl;
}

function extractVideoUrl(videoData) {
  if (!videoData) return null;

  if (videoData.mediaV2 && typeof videoData.mediaV2 === 'string') {
    try {
      const mediaV2 = JSON.parse(videoData.mediaV2);
      const screencast = mediaV2?.video?.opaque1?.default_screencast_stream;
      if (screencast) return screencast;

      const streamTypes = mediaV2?.video?.stream_types || [];
      if (streamTypes.length > 0) {
        return null;
      }
    } catch (e) {}
  }

  if (videoData.media?.stream?.h264?.length) {
    const h264Urls = videoData.media.stream.h264.map(v => v.masterUrl || '').filter(Boolean);
    if (h264Urls[0]) return h264Urls[0];
  }

  if (videoData.media?.stream?.h265?.length) {
    return videoData.media.stream.h265[0]?.masterUrl || null;
  }

  return null;
}

async function parseViaPage(resolvedUrl, noteId) {
  const pageUrl = buildExploreUrl(noteId, resolvedUrl);

  const response = await fetch(pageUrl, {
    headers: HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(15000)
  });

  const html = await response.text();

  if (html.length < 500) {
    throw new Error('小红书返回空页面，可能触发了安全验证');
  }
  if (response.url && /\/sec_[\w]+/.test(response.url)) {
    throw new Error('小红书安全验证拦截，请稍后重试或使用其他链接');
  }
  const errMatch = html.match(/error_code[=:](\d+)/);
  if (errMatch && ['300031', '300012', '300013'].includes(errMatch[1])) {
    const errMsgMatch = html.match(/error_msg=([^&"]+)/);
    const errMsg = errMsgMatch ? decodeURIComponent(errMsgMatch[1]) : '未知错误';
    throw new Error('小红书: ' + errMsg);
  }

  const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.+?\})\s*<\/script>/s);
  if (stateMatch) {
    try {
      const jsonStr = stateMatch[1].replace(/undefined/g, 'null');
      const data = JSON.parse(jsonStr);

      const ndm = data.note?.noteDetailMap || data.noteDetailMap;
      if (ndm) {
        const noteKey = Object.keys(ndm)[0];
        const note = ndm[noteKey]?.note;
        if (note) {
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
    } catch (e) {}
  }

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

export async function parseXiaohongshu(input) {
  const url = extractUrl(input);

  let resolvedUrl = url;
  if (url.includes('xhslink.com') || url.includes('xhslink.cn') || url.includes('xh5.link')) {
    try {
      const r = await fetch(url, {
        headers: HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(15000)
      });
      resolvedUrl = r.url || url;
    } catch (e) {}
  }

  const noteId = extractNoteId(resolvedUrl);
  if (!noteId) throw new Error('无法识别小红书笔记ID（链接可能已过期）');

  try {
    const result = await parseViaPage(resolvedUrl, noteId);
    if (result?.downloadUrl) {
      return result;
    }
  } catch (e) {
    throw e;
  }
}

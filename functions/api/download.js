/**
 * GET /api/download - 代理下载视频（绕过防盗链 + CORS）
 * Cloudflare Workers 会流式传输响应体
 */
export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const downloadUrl = url.searchParams.get('url');
  const title = url.searchParams.get('title') || 'video';

  if (!downloadUrl) {
    return jsonResponse(400, { error: '缺少下载链接' });
  }

  const decodedUrl = decodeURIComponent(downloadUrl);

  // 根据域名动态设置 Referer（防盗链需要正确的 referer）
  let referer = 'https://www.douyin.com/';
  if (decodedUrl.includes('xiaohongshu') || decodedUrl.includes('xhscdn')) {
    referer = 'https://www.xiaohongshu.com/';
  } else if (decodedUrl.includes('kuaishou') || decodedUrl.includes('kwimgs') || decodedUrl.includes('kwaicdn')) {
    referer = 'https://www.kuaishou.com/';
  } else if (decodedUrl.includes('hdslb') || decodedUrl.includes('bilibili')) {
    referer = 'https://www.bilibili.com/';
  } else if (decodedUrl.includes('douyin')) {
    referer = 'https://www.douyin.com/';
  }

  try {
    const upstreamResponse = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': referer,
        'Accept': '*/*',
      },
    });

    if (!upstreamResponse.ok) {
      return jsonResponse(502, { success: false, error: `上游返回 HTTP ${upstreamResponse.status}` });
    }

    const filename = title.replace(/[\/\\:*?"<>|]/g, '_') + '.mp4';
    const encodedFilename = encodeURIComponent(filename);

    // 复制上游响应头，并添加下载相关的头
    const headers = new Headers(upstreamResponse.headers);
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    headers.set('Content-Type', 'video/mp4');
    headers.set('Access-Control-Allow-Origin', '*');

    // 流式传输上游响应体
    return new Response(upstreamResponse.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    return jsonResponse(500, { success: false, error: '下载失败: ' + error.message });
  }
}

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

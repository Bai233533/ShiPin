/**
 * GET /api/proxy-img - 代理图片（解决防盗链）
 */
export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const imgUrl = url.searchParams.get('url');

  if (!imgUrl) {
    return jsonResponse(400, { error: '缺少图片链接' });
  }

  const decodedUrl = decodeURIComponent(imgUrl);

  // 根据域名判断 referer
  let referer = 'https://www.douyin.com/';
  if (decodedUrl.includes('hdslb.com')) {
    referer = 'https://www.bilibili.com/';
  } else if (decodedUrl.includes('douyin') || decodedUrl.includes('douyincdn')) {
    referer = 'https://www.douyin.com/';
  } else if (decodedUrl.includes('kuaishou') || decodedUrl.includes('kwimgs') || decodedUrl.includes('yximgs') || decodedUrl.includes('kwaicdn')) {
    referer = 'https://www.kuaishou.com/';
  } else if (decodedUrl.includes('xiaohongshu') || decodedUrl.includes('xhslink') || decodedUrl.includes('xhscdn')) {
    referer = 'https://www.xiaohongshu.com/';
  }

  try {
    const upstreamResponse = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': referer,
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });

    if (!upstreamResponse.ok) {
      return jsonResponse(502, { success: false, error: `上游返回 HTTP ${upstreamResponse.status}` });
    }

    const contentType = upstreamResponse.headers.get('content-type') || 'image/jpeg';

    const headers = new Headers(upstreamResponse.headers);
    headers.set('Content-Type', contentType);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=3600');

    return new Response(upstreamResponse.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    return jsonResponse(500, { success: false, error: '图片加载失败' });
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

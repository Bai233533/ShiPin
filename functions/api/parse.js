/**
 * POST /api/parse - 解析视频链接
 */
import { parseVideoUrl } from '../../lib/platforms.js';

export async function onRequestPost(context) {
  const { request } = context;

  try {
    const body = await request.json();
    const { url } = body;

    if (!url || !url.trim()) {
      return jsonResponse(400, { success: false, error: '请输入视频链接或分享文本' });
    }

    const result = await parseVideoUrl(url.trim());
    return jsonResponse(200, { success: true, data: result });
  } catch (error) {
    return jsonResponse(500, { success: false, error: error.message || '解析失败' });
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

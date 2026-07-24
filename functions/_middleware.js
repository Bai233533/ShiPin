/**
 * Cloudflare Pages Functions - CORS 中间件
 * 处理所有 /api/* 路由的 OPTIONS 预检请求
 */
export async function onRequest(context) {
  const { request } = context;

  // 处理 CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // 继续到实际路由
  const response = await context.next();

  // 为响应添加 CORS 头
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  newResponse.headers.set('Access-Control-Allow-Origin', '*');

  return newResponse;
}

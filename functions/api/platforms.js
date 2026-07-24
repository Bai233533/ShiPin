/**
 * GET /api/platforms - 返回支持的平台列表
 */
export async function onRequestGet() {
  const platforms = [
    { id: 'douyin', name: '抖音', icon: '🎵', color: '#010101' },
    { id: 'kuaishou', name: '快手', icon: '⚡', color: '#FF4906' },
    { id: 'bilibili', name: 'B站', icon: '📺', color: '#FB7299' },
    { id: 'xiaohongshu', name: '小红书', icon: '📕', color: '#FF2442' }
  ];

  return new Response(JSON.stringify(platforms), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

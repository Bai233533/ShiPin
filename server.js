/**
 * 视频无水印下载 - Node.js 零依赖服务器
 * 使用 Node.js 内置模块: http, fs, path, url
 * Node.js 22+ 内置 fetch API
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { parseVideoUrl } = require('./lib/platforms');

const PORT = process.env.PORT || 3000;

// MIME 类型映射
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
};

/**
 * 静态文件服务
 */
function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  // 安全检查：防止目录遍历
  filePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(__dirname, 'public', filePath);

  if (!fullPath.startsWith(path.join(__dirname, 'public'))) {
    return false;
  }

  try {
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      const content = fs.readFileSync(fullPath);
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'Content-Length': content.length
      });
      res.end(content);
      return true;
    }
  } catch (e) {
    // 文件读取失败
  }

  return false;
}

/**
 * 读取请求 body
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * 响应 JSON
 */
function sendJSON(res, status, data) {
  const json = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(json)
  });
  res.end(json);
}

/**
 * 主服务器
 */
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = urlObj.pathname;

  // ==================== API: 解析视频 ====================
  if (req.method === 'POST' && pathname === '/api/parse') {
    try {
      const { url } = await readBody(req);
      if (!url || !url.trim()) {
        sendJSON(res, 400, { success: false, error: '请输入视频链接或分享文本' });
        return;
      }

      console.log(`\n📥 解析请求: ${url.substring(0, 80)}...`);
      const result = await parseVideoUrl(url.trim());
      console.log(`✅ 解析成功: ${result.platformName} - ${result.title}`);
      
      sendJSON(res, 200, { success: true, data: result });
    } catch (error) {
      console.error('❌ 解析失败:', error.message);
      sendJSON(res, 500, { success: false, error: error.message || '解析失败' });
    }
    return;
  }

  // ==================== API: 代理下载 ====================
  if (req.method === 'GET' && pathname === '/api/download') {
    const downloadUrl = urlObj.searchParams.get('url');
    const title = urlObj.searchParams.get('title') || 'video';

    if (!downloadUrl) {
      sendJSON(res, 400, { error: '缺少下载链接' });
      return;
    }

    const decodedUrl = decodeURIComponent(downloadUrl);
    console.log(`📥 代理下载: ${decodedUrl.substring(0, 80)}...`);

    try {
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

      const response = await fetch(decodedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': referer,
          'Accept': '*/*'
        },
        signal: AbortSignal.timeout(300000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const filename = title.replace(/[\/\\:*?"<>|]/g, '_') + '.mp4';
      const encodedFilename = encodeURIComponent(filename);

      const contentLength = response.headers.get('content-length');
      const headers = {
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}`,
        'Content-Type': 'video/mp4',
        'Access-Control-Allow-Origin': '*'
      };
      if (contentLength) {
        headers['Content-Length'] = contentLength;
      }

      res.writeHead(200, headers);

      // Stream response body
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } catch (streamErr) {
        console.error('流读取错误:', streamErr.message);
      } finally {
        reader.releaseLock();
      }
      
      res.end();
      console.log(`✅ 下载完成: ${filename}`);
    } catch (error) {
      console.error('❌ 下载失败:', error.message);
      if (!res.headersSent) {
        sendJSON(res, 500, { success: false, error: '下载失败: ' + error.message });
      }
    }
    return;
  }

  // ==================== API: 代理图片（解决防盗链） ====================
  if (req.method === 'GET' && pathname === '/api/proxy-img') {
    const imgUrl = urlObj.searchParams.get('url');
    if (!imgUrl) {
      sendJSON(res, 400, { error: '缺少图片链接' });
      return;
    }

    const decodedUrl = decodeURIComponent(imgUrl);
    console.log(`🖼 代理图片: ${decodedUrl.substring(0, 80)}...`);

    try {
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

      const response = await fetch(decodedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': referer,
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const contentLength = response.headers.get('content-length');
      const headers = {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      };
      if (contentLength) {
        headers['Content-Length'] = contentLength;
      }

      res.writeHead(200, headers);

      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } catch (streamErr) {
        console.error('图片流读取错误:', streamErr.message);
      } finally {
        reader.releaseLock();
      }
      res.end();
    } catch (error) {
      console.error('❌ 图片代理失败:', error.message);
      if (!res.headersSent) {
        sendJSON(res, 500, { success: false, error: '图片加载失败' });
      }
    }
    return;
  }

  // ==================== API: 平台列表 ====================
  if (req.method === 'GET' && pathname === '/api/platforms') {
    const platforms = [
      { id: 'douyin', name: '抖音', icon: '🎵', color: '#010101' },
      { id: 'kuaishou', name: '快手', icon: '⚡', color: '#FF4906' },
      { id: 'bilibili', name: 'B站', icon: '📺', color: '#FB7299' },
      { id: 'xiaohongshu', name: '小红书', icon: '📕', color: '#FF2442' }
    ];
    sendJSON(res, 200, platforms);
    return;
  }

  // ==================== 静态文件 ====================
  if (serveStatic(req, res)) return;

  // ==================== 404 ====================
  sendJSON(res, 404, { error: 'Not Found' });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║   🎬  视频无水印下载服务             ║');
  console.log('  ║                                     ║');
  console.log(`  ║   地址: http://localhost:${PORT}         ║`);
  console.log('  ║   Node.js 内置模块 · 零依赖         ║');
  console.log('  ║   Built with WorkBuddy              ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  console.log('  支持平台: 抖音 | 快手 | B站 | 小红书');
  console.log('');
});

const { parseDouyin } = require('./douyin');
const { parseKuaishou } = require('./kuaishou');
const { parseBilibili } = require('./bilibili');
const { parseXiaohongshu } = require('./xiaohongshu');
const { parseWithYtDlp } = require('./ytdlp');

/**
 * Detect platform from URL
 */
function detectPlatform(url) {
  const patterns = {
    douyin: /(?:douyin\.com|iesdouyin\.com)/i,
    kuaishou: /(?:kuaishou\.com|chenzhongtech\.com|gifshow\.com)/i,
    bilibili: /(?:bilibili\.com|b23\.tv|acg\.tv|bili2233\.cn)/i,
    xiaohongshu: /(?:xiaohongshu\.com|xhslink\.com|xhslink\.cn|xh5\.link)/i
  };

  for (const [platform, pattern] of Object.entries(patterns)) {
    if (pattern.test(url)) {
      return platform;
    }
  }

  return 'unknown';
}

/**
 * Parse video URL and return structured info
 */
async function parseVideoUrl(input) {
  const platform = detectPlatform(input);

  switch (platform) {
    case 'douyin':
      return await parseDouyin(input);
    case 'kuaishou':
      return await parseKuaishou(input);
    case 'bilibili':
      return await parseBilibili(input);
    case 'xiaohongshu':
      return await parseXiaohongshu(input);
    case 'unknown':
      return await parseWithYtDlp(input);
    default:
      throw new Error('不支持的平台');
  }
}

/**
 * Get platform display name
 */
function getPlatformName(platform) {
  const names = {
    douyin: '抖音',
    kuaishou: '快手',
    bilibili: 'B站',
    xiaohongshu: '小红书'
  };
  return names[platform] || '未知平台';
}

module.exports = { parseVideoUrl, getPlatformName, detectPlatform };
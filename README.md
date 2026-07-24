# 🎬 视频无水印下载工具

> 多平台视频无水印下载 Web 应用，支持抖音、快手、B站、小红书

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)
![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-orange.svg)

## ✨ 特性

- 🎵 **抖音** - 自动去除水印，最高画质
- ⚡ **快手** - 自动去水印，支持短链解析
- 📺 **B站** - 官方 API，最高画质下载
- 📕 **小红书** - 无水印原视频，支持 xhslink 短链
- 🚀 **零依赖** - 仅使用 Node.js 内置模块，无需 npm install
- 🎨 **现代 UI** - 渐变主题、流畅动画、响应式布局
- ⚡ **代理下载** - 服务端代理视频流，绕过 CORS / 防盗链
- 🛡️ **图片代理** - 自动处理封面图防盗链（hdslb.com / xhscdn.com 等）

## 🚀 快速开始

```bash
# 启动服务器
node server.js

# 浏览器访问
open http://localhost:3000
```

### 环境要求

- Node.js ≥ 22.0.0（依赖内置 `fetch` API）

## 🌐 部署到服务器

详细部署文档见 [DEPLOY.md](./DEPLOY.md)

### 一键部署到 Linux 服务器

```bash
# 安装 Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git

# 克隆并启动
git clone https://github.com/Bai233533/ShiPin.git
cd ShiPin
node server.js
```

### 推荐方案

- **腾讯云轻量应用服务器**（2核2G 4M，24 元/月）：国内访问最快
- 详见 [DEPLOY.md](./DEPLOY.md) 的 systemd 守护进程配置（24/7 运行）

## 📦 项目结构

```
├── server.js              # 主服务器（纯 http 模块）
├── package.json           # 项目元信息（零依赖）
├── lib/
│   ├── platforms.js       # 平台识别 + 路由
│   ├── douyin.js          # 抖音解析器
│   ├── kuaishou.js        # 快手解析器
│   ├── bilibili.js        # B站解析器
│   ├── xiaohongshu.js     # 小红书解析器
│   └── ytdlp.js           # yt-dlp 通用回退（可选）
└── public/
    ├── index.html         # 前端页面
    ├── style.css          # 样式表
    └── app.js             # 前端交互逻辑
```

## 🔧 使用说明

1. 复制视频分享链接或分享文本（如「6.94 复制打开抖音，看看【XX的作品】...」）
2. 粘贴到输入框
3. 点击「解析视频」或按 `Ctrl+Enter`
4. 看到视频信息后点击「下载无水印视频」

## 🛠️ 技术亮点

- **零依赖架构**：网络环境不稳定，改用 Node.js 内置 fetch 替代 axios
- **多方法回退**：每个平台解析器都有 2~3 种解析方式 + 自动降级策略
- **动态 Referer**：下载代理根据 URL 域名自动设置正确的 Referer，绕过防盗链
- **图片代理**：服务端代理加载封面图，避免浏览器防盗链问题
- **短链展开**：自动展开 t.cn / xhslink.cn 等短链，提取真实视频地址

## ⚠️ 注意事项

- 本工具仅供个人学习使用
- 下载的视频版权归原作者所有，请尊重创作者权益
- 请勿用于商业用途或大规模爬取

## 📄 License

MIT License - 详见 [LICENSE](LICENSE) 文件
#!/bin/bash
# 一键启动脚本 - 视频无水印下载服务
# 用法：bash start.sh

set -e

echo "================================================"
echo "  🎬 视频无水印下载服务 - 启动脚本"
echo "================================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未检测到 Node.js，请先安装 Node.js 22+"
    echo "   安装命令: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ Node.js 版本: $NODE_VERSION"

# 检查端口
PORT=${PORT:-3000}
echo "✅ 使用端口: $PORT"

# 启动服务
echo ""
echo "🚀 正在启动服务..."
echo ""

# 使用 node 启动（项目零依赖）
node server.js
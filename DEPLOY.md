# 部署指南 - 视频无水印下载服务

> 推荐使用腾讯云轻量应用服务器（2核2G 4M，月付 24 元，国内访问快）

## 一键部署命令（适用于 Ubuntu/Debian）

```bash
# 1. 安装 Node.js 22（如果未安装）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git

# 2. 克隆项目
cd /root
git clone https://github.com/Bai233533/ShiPin.git
cd ShiPin

# 3. 前台测试（按 Ctrl+C 退出）
node server.js
```

看到以下输出说明启动成功：
```
🎬 视频无水印下载服务
地址: http://localhost:3000
```

---

## 方式 A：前台运行（不推荐，关闭终端就停）

```bash
node server.js
```

## 方式 B：后台运行（推荐）

```bash
# 使用 nohup 后台启动
nohup node server.js > /var/log/shipin.log 2>&1 &

# 查看日志
tail -f /var/log/shipin.log

# 停止服务
pkill -f "node server.js"
```

## 方式 C：systemd 守护进程（最推荐，24/7 运行）

```bash
# 1. 复制服务文件
sudo cp shipin.service /etc/systemd/system/

# 2. 修改路径（如项目不在 /root/ShiPin）
sudo sed -i 's|/root/ShiPin|/实际路径|g' /etc/systemd/system/shipin.service

# 3. 重载配置
sudo systemctl daemon-reload

# 4. 设置开机自启
sudo systemctl enable shipin

# 5. 启动服务
sudo systemctl start shipin

# 6. 查看状态
sudo systemctl status shipin

# 7. 查看日志
sudo journalctl -u shipin -f
```

常用命令：
```bash
sudo systemctl restart shipin   # 重启
sudo systemctl stop shipin      # 停止
sudo systemctl status shipin    # 状态
sudo journalctl -u shipin -f    # 实时日志
```

---

## 配置防火墙

### 腾讯云轻量控制台

1. 控制台 → 轻量应用服务器 → 实例 → 防火墙
2. 添加规则：`TCP:3000`，来源 `0.0.0.0/0`
3. 保存

### 服务器内部防火墙（如有）

```bash
# Ubuntu/Debian ufw
sudo ufw allow 3000/tcp
sudo ufw reload

# CentOS firewalld
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

---

## 反向代理（Nginx，可选）

如果想用 80 端口直接访问（不用带 :3000），或者绑定域名：

```bash
# 安装 Nginx
sudo apt install -y nginx

# 复制配置
sudo cp nginx.conf /etc/nginx/conf.d/shipin.conf

# 修改 server_name（如果有域名）
sudo nano /etc/nginx/conf.d/shipin.conf

# 检查并重载
sudo nginx -t
sudo systemctl reload nginx

# 此时可通过 http://IP 直接访问（不再需要 :3000）
```

---

## 绑定域名（可选）

1. 域名注册商处添加 A 记录：`@ → 服务器公网 IP`
2. 如使用 HTTPS，申请 SSL 证书（Let's Encrypt 免费）：
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

---

## 更新代码

```bash
cd /root/ShiPin  # 或你的实际路径
git pull
sudo systemctl restart shipin
```

---

## 故障排查

| 问题 | 排查方法 |
|------|---------|
| 端口 3000 访问不到 | 检查腾讯云防火墙是否开放 + 进程是否运行 (`ps aux | grep node`) |
| 解析失败 | 检查 Node.js 版本 ≥ 22 (`node -v`) |
| 视频下载超时 | 服务器带宽不够，升级套餐 |
| 服务挂了自动重启 | 已配置 systemd，开机自启 + 崩溃重启 |

查看日志定位问题：
```bash
sudo journalctl -u shipin -n 100 --no-pager
```

---

## 性能调优（可选）

如需提升下载/解析性能：

```bash
# 增加文件描述符限制
echo "fs.file-max=2097152" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# 启用 BBR 拥塞控制（提升带宽利用率）
echo "net.core.default_qdisc=fq" | sudo tee -a /etc/sysctl.conf
echo "net.ipv4.tcp_congestion_control=bbr" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

---

## 卸载

```bash
sudo systemctl stop shipin
sudo systemctl disable shipin
sudo rm /etc/systemd/system/shipin.service
sudo systemctl daemon-reload
rm -rf /root/ShiPin
```
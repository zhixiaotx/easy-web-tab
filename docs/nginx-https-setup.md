# Nginx HTTPS 配置指南（自签名证书 · IP 访问）

> **适用场景**：服务器没有域名，只能通过 IP 访问，但需要 HTTPS 来启用 `crypto.subtle`（密码管理器等功能在 Firefox/Safari 下要求安全上下文）。

---

## 架构说明

```
用户浏览器
    │
    ├── https://<服务器IP>:443  ──→  nginx (SSL 终止)  ──→  proxy_pass 127.0.0.1:16718  ──→  Vue SPA
    │
    └── http://<服务器IP>:80    ──→  nginx (301 重定向) ──→  https://$host
```

| 端口 | 协议 | 作用 |
|------|------|------|
| 443 | HTTPS | SSL 终止，反向代理到本地 16718 服务 |
| 80 | HTTP | 301 跳转到 HTTPS |
| 16718 | HTTP | 后端内部服务（PM2 / Node 直接提供静态文件） |

> 下文所有 `<服务器IP>` / `<你的域名>` 请替换为你自己的实际值。

---

## 操作步骤

### 1. 生成自签名证书

在 CentOS 服务器上执行：

```bash
sudo mkdir -p /etc/pki/nginx/private

sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /etc/pki/nginx/private/server.key \
  -out /etc/pki/nginx/server.crt \
  -subj "/CN=<服务器IP>"
```

> `/CN=` 后面填你服务器的 IP 或域名。
> `-days 3650` 有效期 10 年，到期前需重新生成。

### 2. 编写 nginx 配置

将以下内容保存到 `/etc/nginx/nginx.conf`：

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log;
pid /run/nginx.pid;

include /usr/share/nginx/modules/*.conf;

events {
    worker_connections 1024;
}

http {
    log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                      '$status $body_bytes_sent "$http_referer" '
                      '"$http_user_agent" "$http_x_forwarded_for"';

    access_log  /var/log/nginx/access.log  main;

    sendfile            on;
    tcp_nopush          on;
    tcp_nodelay         on;
    keepalive_timeout   65;
    types_hash_max_size 4096;

    include             /etc/nginx/mime.types;
    default_type        application/octet-stream;

    include /etc/nginx/conf.d/*.conf;

    # HTTP → HTTPS 重定向
    server {
        listen       80;
        listen       [::]:80;
        server_name  <你的域名>;
        return 301 https://$host$request_uri;
    }

    # HTTPS 服务（443 端口）
    server {
        listen       443 ssl http2;
        listen       [::]:443 ssl http2;
        server_name  <服务器IP>;

        ssl_certificate "/etc/pki/nginx/server.crt";
        ssl_certificate_key "/etc/pki/nginx/private/server.key";
        ssl_session_cache shared:SSL:1m;
        ssl_session_timeout  10m;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        location / {
                proxy_pass http://127.0.0.1:16718;
                proxy_set_header Host $host;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                proxy_set_header X-Forwarded-Proto $scheme;
        }
    }

    # 内部静态服务（保持原样，本地访问用）
    server {
        listen 16718;
        server_name localhost;
        location / {
                root /usr/share/nginx/html/dist;
                index index.html index.htm;
                try_files $uri $uri/ /index.html;
                add_header 'Access-Control-Allow-Origin' '*';
                add_header 'Access-Control-Allow-Methods' 'GET,POST,OPTIONS';
                add_header 'Access-Control-Allow-Headers' 'DNT,X-Mx-ReqToken,Keep-Alive,User-Agent,X-Request-With,If-Modified-Since,Cache-Control,Content-Type,Authorization';
        }
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
                expires 1y;
                add_header Cache-Control "public, immutable";
        }
        server_tokens off;
    }
}
```

### 3. 将配置上传到服务器

方式一：从本地 SCP 上传（在本机终端执行）

```bash
scp ./nginx.conf <用户名>@<服务器IP>:/etc/nginx/nginx.conf
```

方式二：在服务器上直接用 vi/nano 粘贴内容

```bash
vi /etc/nginx/nginx.conf
```

### 4. 开放防火墙端口

```bash
sudo firewall-cmd --add-port=443/tcp --permanent
sudo firewall-cmd --reload
```

### 5. 验证并重启 nginx

```bash
sudo nginx -t                     # 检查配置语法
sudo systemctl reload nginx       # 平滑重载（不中断现有连接）
```

如果 nginx 未启动：

```bash
sudo systemctl restart nginx
sudo systemctl enable nginx       # 设置开机自启
```

### 6. 确保后端服务在运行

```bash
# 确认 PM2 / Node 服务在 16718 端口运行
curl -I http://127.0.0.1:16718

# 如果没启动，项目目录下执行
cd /path/to/easy-web-tab
npm run build && npm run serve    # 或者 pm2 start pm2.config.cjs
```

---

## 验证

浏览器访问 `https://<服务器IP>`：

1. 第一次会提示 **"您的连接不是私密连接"**（自签名证书的警告）
2. 点击 **"高级(Advanced)"** → **"继续前往(Proceed)"**
3. 页面正常加载后，密码管理器即可正常使用（`crypto.subtle` 在安全上下文中可用）

---

## 常见问题

### Q: 为什么不用 Let's Encrypt？
Let's Encrypt 需要域名才能签发证书。如果只有 IP，只能用自签名证书。

### Q: 自签名证书安全吗？
加密强度与付费证书相同（TLS + RSA 2048），但浏览器不信任自签名 CA，所以会显示警告。不适合面向公众的生产环境，个人使用完全足够。

### Q: 如果有域名了怎么办？
用 certbot 申请免费证书，替换掉自签名证书：

```bash
sudo dnf install certbot python3-certbot-nginx   # CentOS
sudo certbot --nginx -d <你的域名>
```

### Q: 密码管理器还是报错？
打开浏览器开发者控制台（F12），检查：
- 页面协议是否为 `https://`
- `window.crypto.subtle` 是否为 `undefined`
- 如果两者都正常，检查 `localStorage` 中是否有损坏的数据，清除后重试

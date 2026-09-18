# 云同步改造方案：自建服务器（同域 nginx 存储）· A1

> 状态：**已实现（代码已完成并编译通过）**，服务端 nginx 配置待上线。
> 已确认选型：① 方案 **A1 同域 nginx 存储**；② 服务器环境 **只有 nginx（无 Node/Python）**；③ **保留坚果云兼容**（双通道并存）。
> **最终形态（用户要求）：前端界面零改动**，只按「填写的 WebDAV URL 是否与应用同源」自动判定走直连还是代理。

---

## 1. 背景：现在为什么必须绕代理

当前云同步是 **WebDAV** 协议，但浏览器无法直连第三方 WebDAV：

- WebDAV 要用 `MKCOL`/`PUT` 等非简单方法 + `Authorization` 头 → 触发 CORS 预检（OPTIONS）
- 坚果云 / Nextcloud 默认**不返回** CORS 响应头 → 预检被拦

因此现有实现走"绕道"：

```
浏览器 --POST {target,method,body} + X-Webdav-Auth--> 同源 /api/webdav-proxy
                                                        ↓（Node 代发真实 WebDAV，带 Authorization）
                                                   坚果云 / Nextcloud
```

代价：**同步依赖一个 Node 代理进程常驻**（`webdav-proxy-only.cjs` / `serve-with-rewrites.cjs`，或 Vite dev）。

## 2. 目标架构（A1）

把同步存储挂到**应用同域**下（应用本来就由你的 nginx 托管 `dist`），浏览器发起的是**同源请求 → 不触发 CORS、无预检**：

```
浏览器 --PUT/GET + Authorization--> https://<你的域名>/dav/easy-web-tab/nav.json
                                        ↓
                                   nginx（dav_methods + 目录存储）
```

**收益**：服务端零业务代码（nginx 原生能力）、彻底去掉 Node 代理、更快更可控。
**前提**：应用本身由该域名的 nginx 提供服务（当前已满足）。

## 3. 远端路径（重要）

`useCloudSync.ts` 的 `dirUrl()` 会在配置 URL 后**自动追加 `/easy-web-tab`**：

```ts
function dirUrl(base: string): string {
  const clean = base.replace(/\/$/, '')
  return clean.endsWith(`/${DATA_DIR}`) ? clean : `${clean}/${DATA_DIR}`   // DATA_DIR = 'easy-web-tab'
}
```

所以若设置里填 `https://<域名>/dav/`，5 个信封实际落在：

```
https://<域名>/dav/easy-web-tab/nav.json
https://<域名>/dav/easy-web-tab/icons.json
https://<域名>/dav/easy-web-tab/workbench.json
https://<域名>/dav/easy-web-tab/business.json
https://<域名>/dav/easy-web-tab/student.json
```

## 4. 服务端配置（nginx）

建议放在应用站点根目录下，避免 `alias` 与 dav 模块的已知坑：

```nginx
# 站点根目录假设为 /var/www/html（dist 已部署在此）
location /dav/ {
    # 目录：/var/www/html/dav/  （需预先创建并给 nginx 用户写权限）
    dav_methods PUT DELETE MKCOL;
    dav_access user:rw group:rw all:r;
    create_full_put_path on;

    client_max_body_size 10m;                 # icons.json 已 1.4MB，留足余量
    client_body_temp_path /var/www/nginx-tmp; # 需可写

    # 认证：务必开启（同步数据含密码库等敏感内容）
    auth_basic "easy-web-tab sync";
    auth_basic_user_file /etc/nginx/.ewt_sync_htpasswd;

    # 仅"本地 localhost 跨域调试"时需要；同域访问不会触发，配上也无害
    add_header Access-Control-Allow-Origin $http_origin always;
    add_header Access-Control-Allow-Methods 'GET, PUT, DELETE, MKCOL, HEAD, OPTIONS' always;
    add_header Access-Control-Allow-Headers 'Authorization, Content-Type' always;
    add_header Access-Control-Max-Age 1728000 always;
    if ($request_method = OPTIONS) { return 204; }

    autoindex off;   # 禁止目录列举，避免数据外泄
}
```

配套：
- `mkdir -p /var/www/html/dav /var/www/nginx-tmp`，属主改为 nginx 运行用户（`www-data`/`nginx`）
- `htpasswd -c /etc/nginx/.ewt_sync_htpasswd <用户名>` 生成账号
- **HTTPS 必须**（Basic 认证是明文 base64）→ Let's Encrypt
- `nginx -t && systemctl reload nginx`

## 5. 客户端改动清单（最终版：仅改 1 个文件，前端 UI 零改动）

**唯一改动文件：`src/composables/useCloudSync.ts`**

| 改动点 | 说明 |
|---|---|
| 新增 `shouldUseDirect(syncUrl)` | **自动判定**：`new URL(syncUrl).origin === location.origin` → 直连；否则（跨域 / 解析失败）→ 代理。**不再需要任何「连接方式」开关** |
| 新增 `directDav(...)` | 浏览器直连 `fetch`，带标准 `Authorization: Basic <base64(user:pass)>`（用户名或密码任一非空才发） |
| 统一入口 `davRequest(...)` | 内部按 `shouldUseDirect(targetUrl)` 分流到 `directDav` / `proxyDav`，所有 GET/PUT/MKCOL/DELETE/HEAD 均走它 |
| `dirUrl(base, username?)` | 直连时把**用户名**作为路径段插在基础 URL 与 `easy-web-tab` 之间；用户名做 `sanitizeDirName()`（仅保留 `A-Za-z0-9_-`）防路径穿越 |
| `webdavMkcol` 405 语义 | 直连时 405 视为「目录已存在」直接返回成功（直连没有代理的 `X-Upstream-Status` 头可判） |
| `testConnection` 报错提示 | 按直连/代理分别给不同排查文案 |

**已撤销的改动**（曾实现、后按用户要求回滚，diff 归零）：
`src/types/index.ts`、`src/stores/settings.ts`（`cloudSyncDirect` 开关字段）、`src/components/AppSettingsDialog.vue`（「连接方式」下拉）。

**不需要改动**：`exportWorkbench`/`mergeWorkbench`/`reloadWorkbenchStores` 等 5 份信封的导出/合并/重载逻辑全部复用（合并逻辑在客户端做，服务端只存文件）。这是本次改动面小的关键。

## 6. 两处关键逻辑差异（实现时务必注意）

### 6.1 认证头
- 代理模式：走 `X-Webdav-Auth` 自定义头（避免同源代理上的预检）
- **直连模式**：必须发标准 `Authorization: Basic <base64(user:pass)>`，否则 nginx `auth_basic` 不认

### 6.2 MKCOL 的 405 语义（易踩坑）
现有 `webdavMkcol()` 对 405 的判定是**围绕代理设计的**：

> 坚果云"目录已存在"回 405（正常）；但代理未生效时 `POST /api/webdav-proxy` 也回 405（假成功）。
> 代码用响应是否带 `X-Upstream-Status` 头来区分两者。

**直连模式没有代理、也没有 `X-Upstream-Status` 头** → 必须改为：**直连时 MKCOL 返回 405 即视为"目录已存在/成功"**，不能套用代理那套判定，否则会把真实的"方法不允许"也吞掉，或反过来误判。

## 7. 双通道定位与兼容策略

用户明确：**两条路都保留**，面向不同人群：

| 通道 | 面向 | 定位 |
|---|---|---|
| **代理**（WebDAV） | **其他人 / 普通用户** | 保持现状、默认项。零门槛，坚果云 / Nextcloud 等任意 WebDAV |
| **直连**（自建服务器） | **自己 / 熟悉的人** | 新增可选项。需有自己的服务器并做服务端配置 |

两条通道并存，现有配置与数据不受影响。**判定方式：看填写的 WebDAV URL 是否与应用同源（不是靠开关）**——

```
用户只填 3 个框：URL / 用户名 / 密码
   ├─ URL 的 origin == 页面 origin（同一域名）→ 直连自建服务器（nginx）
   └─ URL 的 origin != 页面 origin（坚果云等）→ 走 /api/webdav-proxy 代理
```

好处：普通用户零感知（填坚果云照旧走代理）；自建用户填自己域名即可自动直连，无需多一个选项去理解。

## 7.1 自建服务器给多人用 → 必须按账号隔离存储（关键）

自建服务器若多人共用**同一个目录**，会出现两个严重问题：

1. **互相覆盖**：A 的 `workbench.json` 会被 B 的推送直接覆盖（同一文件名）
2. **互相可见**：同步内容含密码库、笔记、记账等敏感数据，同目录即互相可读

因此**必须一人一个隔离目录**。纯 nginx 方案（无需任何后端）：让 URL 里带用户名，并在 nginx 侧校验认证用户与路径用户一致，不一致直接 403。

```nginx
# 每个用户一个目录：/var/www/sync/dav/<用户名>/  （需预创建，属主给 nginx 用户）
location ~ ^/dav/([^/]+)/ {
    # 核心：认证用户名必须与 URL 里的用户名一致，否则禁止跨用户访问
    if ($remote_user != $1) { return 403; }

    root /var/www/sync;                 # 静态 root，避免 dav + 变量路径的兼容问题
    dav_methods PUT DELETE MKCOL;
    dav_access user:rw group:rw all:r;
    create_full_put_path on;

    client_max_body_size 10m;
    client_body_temp_path /var/www/nginx-tmp;

    auth_basic "easy-web-tab sync";
    auth_basic_user_file /etc/nginx/.ewt_sync_htpasswd;

    add_header Access-Control-Allow-Origin $http_origin always;
    add_header Access-Control-Allow-Methods 'GET, PUT, DELETE, MKCOL, HEAD, OPTIONS' always;
    add_header Access-Control-Allow-Headers 'Authorization, Content-Type' always;
    if ($request_method = OPTIONS) { return 204; }

    autoindex off;
}
```

使用方式（每人填自己的 URL，应用端代码无需额外改动）：

```
alice：cloudSyncUrl = https://<域名>/dav/alice/
bob  ：cloudSyncUrl = https://<域名>/dav/bob/
```

文件实际落点（回顾 §3，`dirUrl()` 会自动追加 `/easy-web-tab`）：

```
/var/www/sync/dav/alice/easy-web-tab/nav.json
/var/www/sync/dav/bob/easy-web-tab/nav.json
```

运维：新增一个人 = `htpasswd` 加一个账号 + `mkdir /var/www/sync/dav/<用户名>`（属主给 nginx 用户）。

> 备选（URL 不想暴露用户名时）：用 `root /var/www/sync/$remote_user;`，但 **nginx 的 dav 模块搭配变量路径有已知兼容问题，需实测**；上面"URL 带用户名 + `$remote_user` 校验"的写法用的是静态 `root`，更稳妥，优先选它。

## 8. 风险与待实测项

1. **nginx 是否含 dav 模块**：`nginx -V 2>&1 | grep -o http_dav_module`（官方包通常内置；应用只用 GET/PUT/MKCOL/DELETE/HEAD，**不需要** PROPFIND，故标准模块足够，无需 `dav_ext`）
2. **目录写权限 / SELinux**：若服务器开 SELinux，nginx 写文件会被拦，需 `chcon` 或设布尔值
3. **`auth_basic` 与 OPTIONS 预检**：本地 `localhost` 跨域调试时，预检 OPTIONS 不带 `Authorization`，若被 `auth_basic` 拦会 401 → 预检失败。**建议规避：本地调试继续用「代理」通道；生产同域访问本就无 CORS 问题。** 若确需本地直连调试，须实测 `if ($request_method = OPTIONS) { return 204; }` 能否先于 `auth_basic` 生效
4. **`client_max_body_size`**：`icons.json` 已达 1.4MB，务必 ≥10m（你此前已为代理配过）
5. **安全**：`/dav/` 必须认证 + HTTPS + `autoindex off`，否则同步数据（含密码库）可被匿名读取/列举
6. **MKCOL 首次建目录**：nginx 返回 201；目录已存在返回 405 → 依赖 6.2 的容错

## 9. 验证步骤

1. `nginx -t` 通过并 reload
2. 命令行先验证（不依赖前端）：
   - `curl -u u:p -X MKCOL https://<域名>/dav/easy-web-tab` → 期望 201（再执行一次 405）
   - `curl -u u:p -X PUT --data '{"a":1}' https://<域名>/dav/easy-web-tab/nav.json` → 201/204
   - `curl -u u:p https://<域名>/dav/easy-web-tab/nav.json` → 返回刚才内容
   - 未带认证访问 → 401
3. 应用端（**无新增选项，照旧填 3 个框**）：设置 → 云同步 → URL 填 `https://<域名>/dav/`、用户名 `sifujiang`、密码 `sfj131420ylj&` → 测试连接 → 立即同步
   - 因 URL 与页面同源 → 自动走直连，实际写 `https://<域名>/dav/sifujiang/easy-web-tab/`
4. 确认服务器目录出现 5 个 json；切换设备/清缓存后拉取能还原
5. 回归：把 URL 换成坚果云（跨域）→ 自动回落代理通道，确认原有链路仍可用

## 10.5 最终决策（用户已确认，以下为准）

| 项 | 决定 |
|---|---|
| 使用人群 | **自己家人**，用目录名区分 |
| 预置同步名 | `sifujiang`、`yanglijuan`，**其他路径一律拦截 403** |
| 存储根目录 | `/var/sifujiang/dav` |
| URL 前缀 | `/dav/` |
| 认证 | **需要密码**（`auth_basic`；用户名 `sifujiang` / `yanglijuan`，密码 `sfj131420ylj&`） |
| 用户名用途 | **用户名即服务器上的个人目录名**，由应用拼进 URL |
| 本地 localhost 调试 | 继续走「代理」通道 |
| 通道判定 | **不设开关**：URL 与页面同源 → 直连；跨域 → 代理（前端 UI 零改动） |
| 默认项 | 代理（坚果云等第三方），自建域名用户自动直连 |

### 最终 URL 拼接规则（关键）

设置里只需填 **基础 URL**，应用会自动补上「用户名目录」与 `easy-web-tab`：

```
设置：URL    = https://<域名>/dav/      ← 与应用同域 → 自动判定为「直连」
      用户名 = sifujiang
      密码   = sfj131420ylj&

实际同步目录 = https://<域名>/dav/sifujiang/easy-web-tab/
文件落点     = /var/sifujiang/dav/sifujiang/easy-web-tab/{nav,icons,workbench,business,student}.json
```

换 `yanglijuan` 即落到 `/dav/yanglijuang/`（应为 `yanglijuan`）目录下 —— 一家人共用一台服务器，靠用户名天然隔离。
（注：你消息里写的 `dav/sifujaing` 应为 `sifujiang` 的笔误，实现以用户名字段为准并做了非法字符过滤。）

### 最终 nginx 配置（以此为准，取代 §4/§7.1 的示例）

```nginx
# 允许的家人目录（白名单），root 用 /var/sifujiang，使 URI /dav/<name>/ 映射到 /var/sifujiang/dav/<name>/
location ~ ^/dav/(sifujiang|yanglijuan)/ {
    # 认证：账号即 htpasswd 里的用户名
    auth_basic "easy-web-tab sync";
    auth_basic_user_file /etc/nginx/.ewt_sync_htpasswd;

    # 隔离：认证用户名必须与 URL 里的目录名一致，防止互访（$remote_user 由 auth_basic 提供）
    if ($remote_user != $1) { return 403; }

    root /var/sifujiang;
    dav_methods PUT DELETE MKCOL;
    dav_access user:rw group:rw all:r;
    create_full_put_path on;

    client_max_body_size 10m;
    client_body_temp_path /var/sifujiang/tmp;

    autoindex off;

    # 本地 localhost 跨域调试时需要（生产同域不触发 CORS）
    add_header Access-Control-Allow-Origin $http_origin always;
    add_header Access-Control-Allow-Methods 'GET, PUT, DELETE, MKCOL, HEAD, OPTIONS' always;
    add_header Access-Control-Allow-Headers 'Authorization, Content-Type' always;
    if ($request_method = OPTIONS) { return 204; }
}

# 其余 /dav/ 路径全部拦截（正则 location 优先匹配，未命中白名单者落到这里）
location /dav/ { return 403; }
```

生成口令文件（两个家人账号同一口令）：

```bash
htpasswd -bc /etc/nginx/.ewt_sync_htpasswd sifujiang  'sfj131420ylj&'
htpasswd -b  /etc/nginx/.ewt_sync_htpasswd yanglijuan 'sfj131420ylj&'
```

> 口令含 `&`，命令行务必用**单引号**包裹，否则会被 shell 当作后台符。

预创建目录（属主给 nginx 运行用户）：

```bash
mkdir -p /var/sifujiang/dav/sifujiang /var/sifujiang/dav/yanglijuan /var/sifujiang/tmp
chown -R nginx:nginx /var/sifujiang      # 用户/组按实际运行用户调整（www-data 等）
```

两人在设置里填的内容（**URL 相同**，靠用户名区分目录；应用自动追加 `/easy-web-tab`）：

```
            URL                    用户名         密码
sifujiang : https://<域名>/dav/    sifujiang     sfj131420ylj&
yanglijuan: https://<域名>/dav/    yanglijuan    sfj131420ylj&
```
（两处填写完全一样的形式，靠用户名分流到各自目录；同域 → 自动直连，无需任何额外开关）

### 认证与隔离（已解决）

最初选定"不用密码"时我提示过风险：同步内容含**密码库、笔记、记账**，无认证等于任何人拿到 URL 即可读写全部数据。
现按你的最新要求改为**启用 `auth_basic`**，风险解除；同时用 `if ($remote_user != $1)` 保证**账号只能访问自己的目录**，一家人之间也不会互串。

### 客户端侧改动（因"用户名即目录名 + 需要密码"）

- `dirUrl(base, username)`：直连模式下把**用户名**作为一段路径插在基础 URL 与 `easy-web-tab` 之间；并对用户名做非法字符过滤（仅保留 `A-Za-z0-9_-`），避免路径穿越
- 直连与代理**同样要求 URL + 用户名 + 密码三者齐全**（用户名=目录名，密码=认证口令）
- `Authorization` 头：只要填了用户名或密码就发送；两者皆空则不发
- **前端 UI 不新增任何控件**（用户明确要求）：直连/代理由 `shouldUseDirect()` 从 URL 自动判定

## 10. 原「待确认」6 项 → 已全部定稿（见 §10.5）

| # | 问题 | 结论 |
|---|---|---|
| 1 | 给几个人用 | 家人，目录名隔离（§7.1 隔离配置） |
| 2 | 存储根目录 | `/var/sifujiang/dav` |
| 3 | URL 前缀 | `/dav/` |
| 4 | 认证方式 | 沿用「用户名 + 密码」，服务端 htpasswd（`auth_basic`） |
| 5 | localhost 调试 | 仍走代理通道（见风险 3） |
| 6 | 默认项 | 代理为默认行为；**不设开关**，同域自动直连 |

## 11. 当前进度

- [x] 客户端代码（`useCloudSync.ts` 自动判定 + 直连实现）
- [x] 完整编译通过：`vue-tsc -b` + `vite build`
- [ ] 服务端 nginx 按 §12 配置并 reload
- [ ] curl 验证（§12.6）
- [ ] 应用端实测同步/还原 + 代理通道回归

---

## 12. 通用多用户版（**当前目标形态，取代 §10.5 的写死名单**）

### 12.1 需求变化

> 「用户名跟密码改成服务器的，做个验证。不用写死那两个名称和目录。其他人若自己部署服务器也能用。
> 服务器有多个用户（root、lucky…），**只要用户名与服务器密码对得上就能同步**；
> 目录改成 **`/home/<用户名>/`**，在用户名下面建同步目录。服务器一般是 Linux。」

| 项 | §10.5 旧版 | §12 新版 |
|---|---|---|
| 账号来源 | htpasswd 里手工建 `sifujiang`/`yanglijuan` | **服务器系统账号**（`/etc/passwd` + `/etc/shadow`） |
| 可用账号 | 写死 2 个白名单 | **任意系统用户**，认证通过即可（建议限制 uid ≥ 1000） |
| 密码 | 另设的同步口令 | **该用户的系统登录密码** |
| 数据目录 | `/var/sifujiang/dav/<名>/easy-web-tab/` | **`/home/<用户名>/easy-web-tab/`** |
| 适用人群 | 只有自己家 | **任何人自建服务器都能照抄**（换域名即可） |

URL 结构**不变**（客户端零改动）：`https://<域名>/dav/<用户名>/easy-web-tab/`。

### 12.2 认证：系统账号 + 系统密码（**推荐：shadow 哈希镜像，不用装 PAM 模块**）

你的机器是阿里云 ECS（Alibaba Cloud Linux / CentOS 系），**RHEL 系官方源没有 nginx 的 PAM 模块**（要付费源或自编译）。
但其实**不用 PAM 也能用系统密码**：nginx 的 `auth_basic_user_file` 直接支持系统 `crypt(3)` 哈希，
包括 `$6$`（SHA-512）——**这正是 `/etc/shadow` 里存的格式**（nginx 官方文档明确列出 `$1$`/`$5$`/`$6$`）。
所以只要把 shadow 里的哈希抄成 htpasswd 文件，密码**就是该用户的系统登录密码**。

生成脚本（**只取 uid ≥ 1000 的普通用户，root / 系统账号自动排除**）：

```bash
sudo tee /usr/local/sbin/ewt-sync-passwd.sh >/dev/null <<'EOF'
#!/bin/bash
set -euo pipefail
OUT=/etc/nginx/.ewt_sync_htpasswd
TMP=$(mktemp); chmod 640 "$TMP"
# 只镜像普通用户(uid>=1000)且密码字段是有效哈希(排除 !/* 锁定账号)
awk -F: '($3>=1000) && ($2 ~ /^\$(1|5|6|2[aby])\$/) { print $1 ":" $2 }' /etc/shadow > "$TMP"
chown root:nginx "$TMP" 2>/dev/null || chown root:www-data "$TMP"   # Alinux/CentOS 是 nginx，Debian 是 www-data
chmod 640 "$TMP"; mv "$TMP" "$OUT"
EOF
sudo chmod +x /usr/local/sbin/ewt-sync-passwd.sh
sudo /usr/local/sbin/ewt-sync-passwd.sh
sudo cat /etc/nginx/.ewt_sync_htpasswd      # 应看到 <用户名>:$6$... 若干行
```

定时刷新（用户改密码后自动跟上；**每 5 分钟**）：

```bash
sudo tee /etc/systemd/system/ewt-sync-passwd.service >/dev/null <<'EOF'
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/ewt-sync-passwd.sh
EOF
sudo tee /etc/systemd/system/ewt-sync-passwd.timer >/dev/null <<'EOF'
[Timer]
OnBootSec=1min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
EOF
sudo systemctl enable --now ewt-sync-passwd.timer
# 不用 systemd 就写 crontab：*/5 * * * * /usr/local/sbin/ewt-sync-passwd.sh
```

⚠️ 三个注意点：

1. **这是快照**：用户改密码后，旧哈希在下次刷新前仍然有效 → 5 分钟刷新即可接受；改完密码也可手动跑一次脚本。
2. **root 自动被排除**（uid<1000），符合你的选择。
3. 文件里是与 shadow 同等强度的 SHA-512 加盐哈希，权限 `640 root:nginx`，**不要放进 web 目录**。

nginx 侧就是最朴素的 Basic 认证：

```nginx
auth_basic "easy-web-tab sync";
auth_basic_user_file /etc/nginx/.ewt_sync_htpasswd;
```

> **备选（Debian/Ubuntu 想要"实时"校验）**：装 `libnginx-mod-http-auth-pam`，用 `auth_pam` + `/etc/pam.d/ewt-sync`
> （含 `pam_succeed_if.so uid >= 1000`），代价是要让 nginx 用户能读 `/etc/shadow`（`setfacl -m u:www-data:r /etc/shadow`）。
> 阿里云这台**不需要**走这条路。

### 12.3 目录：`/home/<用户名>/easy-web-tab/`

nginx 用**静态 root + 符号链接农场**映射（刻意避开 `alias` + dav 的兼容坑）：

```bash
sudo mkdir -p /var/ewt-sync /var/lib/nginx/ewt-tmp
# 每个允许同步的用户建一次：
sudo install -d -o www-data -g www-data -m 755 /home/<用户名>/easy-web-tab
sudo setfacl -m u:www-data:x /home/<用户名>              # 让 worker 能穿过家目录（只给执行/进入权）
sudo ln -s /home/<用户名> /var/ewt-sync/<用户名>          # ← 链到家目录本身
sudo chown -R www-data:www-data /var/lib/nginx/ewt-tmp
```

映射结果：URI `/dav/<用户名>/easy-web-tab/nav.json`
→ `/var/ewt-sync/<用户名>/easy-web-tab/nav.json`
→ **`/home/<用户名>/easy-web-tab/nav.json`**

> 备选（不想用软链）：正则 location 里 `alias /home/$sync_user/;`。语法合法但 **dav + alias 需实测**，
> 我优先推荐软链（root 是静态路径，dav 模块最稳）。

### 12.4 nginx 配置（以此为准）

```nginx
location ~ ^/dav/(?<sync_user>[A-Za-z0-9._-]+)/ {
    # ① 系统账号认证（密码=该用户的系统登录密码，见 §12.2）
    auth_basic "easy-web-tab sync";
    auth_basic_user_file /etc/nginx/.ewt_sync_htpasswd;

    # ② 隔离：认证通过的用户名必须 == URL 里的目录名（$remote_user 由 Basic 认证头解析）
    if ($remote_user != $sync_user) { return 403; }

    # ③ 静态 root + 软链（/var/ewt-sync/<user> -> /home/<user>）
    root /var/ewt-sync;
    dav_methods PUT DELETE MKCOL;
    dav_access user:rw group:rw all:r;
    create_full_put_path on;

    client_max_body_size 10m;                  # icons.json 已 1.4MB
    client_body_temp_path /var/lib/nginx/ewt-tmp;   # 尽量与 /home 同文件系统，避免跨设备拷贝

    autoindex off;

    # 本地 localhost 跨域调试时才用得到（生产同域不触发 CORS）
    add_header Access-Control-Allow-Origin  $http_origin always;
    add_header Access-Control-Allow-Methods 'GET, PUT, DELETE, MKCOL, HEAD, OPTIONS' always;
    add_header Access-Control-Allow-Headers 'Authorization, Content-Type' always;
    if ($request_method = OPTIONS) { return 204; }
}

# 未带用户名段的 /dav/ 一律拒绝
location /dav/ { return 403; }
```

为什么能用 `$remote_user`：nginx 核心的 `ngx_http_auth_basic_user()` 解析 `Authorization: Basic`
后把用户名写进 `r->headers_in.user`，`$remote_user` 即取此值（PAM 模块走的也是同一个值，所以两种认证方式都能用这招隔离）。

### 12.5 客户端侧配套小改（2 处）

| 位置 | 现在 | 要改成 |
|---|---|---|
| `sanitizeDirName()` | 只留 `A-Za-z0-9_-`，会**吃掉 `.`** | 放宽为 `A-Za-z0-9._-`，并显式拒绝 `..`（系统用户名合法字符集 `[a-z_][a-z0-9_-]*[$]?`，含点号很常见） |
| `webdavMkcol()` | 直连下 405 → 目录已存在，放过 | 再加：**直连下 409 也放过**——目录未预建时，靠 `create_full_put_path on` 让随后的 PUT 自动建出完整路径（首次使用免手工 mkdir） |

其余（自动判定、直连发 `Authorization`、按用户名拼目录）**完全不变**。

### 12.6 验证

```bash
# 1) 模块与配置
nginx -V 2>&1 | grep -o http_dav_module              # 必须有 dav 模块
sudo cat /etc/nginx/.ewt_sync_htpasswd               # 应有 lucky:$6$... 行
systemctl list-timers | grep ewt-sync-passwd         # 刷新定时器在跑
sudo nginx -t

# 2) 认证（用 lucky 的系统密码）
curl -u lucky -X MKCOL https://<域名>/dav/lucky/easy-web-tab   # 201，再执行一次 405
curl -u lucky -X PUT --data '{"a":1}' https://<域名>/dav/lucky/easy-web-tab/nav.json
curl -u lucky https://<域名>/dav/lucky/easy-web-tab/nav.json     # 返回内容
ls -l /home/lucky/easy-web-tab/                                  # 文件确实落在家里

# 3) 隔离（应 403）
curl -u lucky https://<域名>/dav/root/easy-web-tab/nav.json
curl -u lucky https://<域名>/dav/otheruser/easy-web-tab/nav.json

# 4) 系统账号限制（应 401）
curl -u root https://<域名>/dav/root/easy-web-tab/nav.json

# 5) 未认证（应 401）
curl https://<域名>/dav/lucky/easy-web-tab/nav.json
```

### 12.7 备选 A：另设同步口令（不镜像 shadow）

若不想把系统密码哈希交给 nginx，可完全脱离系统账号：`sudo htpasswd /etc/nginx/.ewt_sync_htpasswd <用户名>`
手工加账号（用户名仍即目录名，`/home/<用户名>/easy-web-tab/` 结构不变，也不再需要 §12.2 的刷新定时器）。
代价：密码不是系统密码。

### 12.7B 备选 B：PAM 实时校验（Debian/Ubuntu 更方便）

`apt install libnginx-mod-http-auth-pam` → 建 `/etc/pam.d/ewt-sync`（`auth/include common-auth` +
`pam_succeed_if.so uid >= 1000`）→ nginx 用 `auth_pam` / `auth_pam_service_name "ewt-sync"` →
`setfacl -m u:www-data:r /etc/shadow`。优点：改密码立即生效；缺点：web 进程可读 shadow、且 RHEL 系要自己编译模块。

### 12.8 部署一页纸（自己或别人照抄即可）

1. 建口令镜像：`/usr/local/sbin/ewt-sync-passwd.sh`（§12.2）+ 5 分钟定时器
2. 建目录与软链（每个要同步的用户一条，§12.3）
3. 贴 §12.4 的 nginx 配置，`nginx -t && systemctl reload nginx`
4. 应用里填：URL `https://<自己的域名>/dav/`、用户名 = 系统用户名、密码 = **该用户的系统登录密码**
5. 新增用户 = 在系统里 `useradd` 一个普通账号 + 跑一遍 §12.3 的两条命令（口令文件 5 分钟内自动带上他）

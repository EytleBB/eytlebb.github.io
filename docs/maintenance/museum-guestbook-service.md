# 图画展览会访客铭牌：存储、服务与维护

这项功能在画作右侧提供取名、投票和评论。公开内容保存在服务器 SQLite，所有访客读取同一份数据；浏览器只保存签名匿名身份 Cookie，不把本地浏览器存储伪装成共享留言。没有账户、邮箱或公开昵称要求。票数最高的可见候选名成为画下标题，零票也立即参与选择；同票时按提交时间先后，时间相同再按 ID 排序。没有提名时接口返回 null，界面显示 NULL。新提名不会自动获得作者的一票。

代码仅增加待发布的服务及配置示例，**没有安装服务器服务、修改 Nginx 或发布网站**。按照 AGENTS.md，由“Eytle 网站发布会话”审查合入、配置、测试和发布。现有纯静态服务或 GitHub Pages 本身不能持久保存多人留言；正式启用需要腾讯云上以下独立服务和同域反向代理。API 不可用时，界面明确显示连接失败，不会显示虚假成功。

## 文件和运行方式

- `server/museum_guest_api.py`：Python 3.10+ 标准库实现，无 pip 依赖；SQLite 使用 WAL、外键约束和显式事务。
- `tests/test_museum_guest_api.py`：实际 HTTP/SQLite 测试，包含多线程同时投票及证明重放。
- 内容与配额 SQLite 必须位于网站根目录和源码目录之外；启动和备份命令均拒绝放到这些目录里。默认最大数据库逻辑容量 256 MiB，另需为 WAL、备份和操作系统保留空间。
- 生产服务只绑定 `127.0.0.1:8765`，Nginx 提供 HTTPS、请求排队及连接限制；不直接对公网开放 Python 端口。每进程最多 32 个请求线程，连接读超时 8 秒。
- 生产 `MUSEUM_SECRET` 必须提供至少 32 字节的高熵值，不能提交到 Git；建议用 `secrets.token_hex(32)` 生成 64 位十六进制。修改密钥会让已有身份 Cookie 失效，旧票仍保留，因此应避免无故轮换。

本地独立预览（替换目录为当前功能工作树；数据库不在网站内）：

```bash
cd /tmp/eytle-museum-visitor-plaques
python3 server/museum_guest_api.py serve \
  --db /tmp/eytle-museum-guestbook/guestbook.sqlite3 \
  --dev-static --port 8001
```

打开 `http://127.0.0.1:8001/museum.html`，或 `museum.html?perf=walk` 检查自动行走渲染。本地模式在数据库旁创建 `development.secret`，重启后身份保持有效。本地模式 Cookie 无 `Secure`，仅用于 loopback HTTP；生产模式要求 HTTPS Origin 并加上 `Secure`。`--dev-static` 只提供指定的 HTML、js/css/images/fonts/audio/logs 公共目录及 `_shots` 中的视觉验证文件，禁止内部目录、点文件、路径越界及符号链接，不列出目录。它不是完整的网站下载服务器，正式静态文件仍由 Nginx 提供。

运行测试：

```bash
python3 -m unittest discover -s tests -p 'test_museum_guest_api.py' -v
```

受限沙箱若不允许创建 socket，需要允许本地 loopback 测试；测试使用临时目录和随机本地端口，不访问外网。

## API 合约

API 前缀 `/api/museum/v1`。所有响应均为 JSON、`Cache-Control: no-store`、`nosniff`，不发送跨域 CORS 授权。POST 必须携带同域 `Origin`、签名 Cookie、`Content-Type: application/json` 和 `X-CSRF-Token`；请求体上限 4096 字节。Host 必须与配置的 Origin 一致。

| 请求 | 响应/行为 |
| --- | --- |
| `GET /session` | `{csrf,powBits}`；首次设置 HttpOnly、SameSite=Strict、API 路径作用域的签名匿名 Cookie，最长 180 天 |
| `POST /challenge`，空对象 `{}` | `{id,prefix,bits,expiresAt}`；`expiresAt` 为 Unix **毫秒** |
| `GET /artworks?ids=0x0000.jpg,0x0001.jpg` | 最多 80 个 ID，`{artworks:[{id,title,titleVotes,namesCount,commentsCount}]}`；无可见候选时 `title:null` |
| `GET /artworks/{encoded-id}` | `{artwork,names,comments,nextNamesOffset,nextCommentsOffset}`；名称按票数降序、提交时间升序、ID 升序；评论按 ID 降序 |
| 同上 `?namesOffset=20&commentsOffset=20` | 各自每页 20 项，下一偏移为整数或 `null`；不会截掉后面的名字或评论 |
| `POST /artworks/{id}/names` | `{text,website:'',proof:{id,nonce}}`；提名成功后返回 `{ok,id,artwork}` |
| `POST /artworks/{id}/comments` | 同上；文本为评论 |
| `POST /artworks/{id}/votes` | `{nameId,website:'',proof:{id,nonce}}`；`nameId` 是 JSON 整数。每身份每画最多一张有效票：重复点赞撤回，点另一名称原子切换；返回 `{ok,voted,artwork}` |
| `GET /health` | `{ok:true}`，同样受 Host/请求频率约束 |

名称对象为 `{id,text,votes,voted,createdAt}`；评论为 `{id,text,createdAt}`，`createdAt` 为 UTC ISO 8601 字符串。匿名作者内部标识不公开。详情可不登录读取，有 Cookie 时 `voted` 只标记该访客的投票。批量摘要、分页读取及获胜者查询在一致的 SQLite 读事务中完成。

证明算法为 `SHA256(UTF8(prefix + nonce))`，哈希前 `bits` 位为零。`nonce` 必须是十进制**字符串**，不能有前导零（单独 `"0"` 除外）；最多 20 位。默认 18 位，即平均约 262144 次哈希；浏览器在 Worker 中计算，不阻塞行走和动画。挑战有 180 秒有效期，绑定访客，最多保留每访客最近 3 个。已验证的挑战在独立事务中删除，后续即使提交遇到重复/限额，也必须申请新挑战；错误和过期证明同样一次性消费，跨访客不能盗用。

错误为 `{error:{code,message,retryAfter?}}`，429 同时返回 `Retry-After` 秒数。常见代码：`session_required`、`csrf_invalid`、`origin_forbidden`、`proof_invalid`、`proof_expired`、`invalid_text`、`duplicate`、`rate_limited`、`limit_reached`、`artwork_not_found`、`name_not_found`、`service_busy`。前端应按代码本地化，不能把服务器错误文本当 HTML。

## 数据和防滥用

画作标识必须精确存在于自动生成的 `images/gallery/index.json`；该文件更新后服务重载允许列表，不接受任意文件名或路径。数据库只存文本，不能上传图片/附件。

提名最长 40 个 Unicode 码点、评论最长 280 个。服务器执行 NFKC、空白合并和去首尾空白；按 casefold 后文本检查同画重复（隐藏项也不能重复轰炸）。拒绝控制/方向覆盖字符、常见 URL 协议和网址前缀，保留普通换行输入的语义为空格及语言所需连接符。至少需要一个可见基础字符，拒绝只含连接符、变体选择符、组合符或空白字形的内容；词语和 emoji 内部的正常连接符仍然可用。全部 SQL 值使用参数绑定，HTML/Markdown 作为普通文本，前端必须通过 `textContent` 渲染。

限流使用 UTC 固定时间窗口，计数持久保存在 SQLite，重启不会重置。Cookie 不能由客户端伪造，但匿名身份并不等于真实人类身份：删除 Cookie、换浏览器、共享网络和机器人网络仍存在。PoW、同 IP/IPv6 前缀限额和全站总额用于提高轰炸成本；不声称能阻挡大型分布式攻击。出现持续攻击时先在 Nginx 临时关闭写入或收紧限流，再考虑额外人机验证/登录，不应静默丢弃合法内容。

| 范围 | 默认限制/保留期限 |
| --- | --- |
| API 请求 | 每 IP 180 次/分钟，GET 与 POST 均计算 |
| 挑战签发 | 全站 5000 次/小时；每 IP 40 次/10 分钟；每身份 20 次/10 分钟 |
| 所有成功写入 | 全站 2000 次/UTC 日；每 IP 12 次/分钟、120 次/日；每身份 6 次/分钟、50 次/日 |
| 文本提交 | 每 IP 共 40 次/日 |
| 每画提名 | 每身份 3 条/日；每画总计 1000 条（含隐藏项） |
| 每画评论 | 每身份 10 条/日；每画总计 5000 条（含隐藏项） |
| 投票切换/撤回/增加 | 每 IP、每画共 12 次/日，每身份每画最多一张有效票 |
| IP 标识 | 不存原始 IP；IPv4 单地址，IPv6 按 `/64` 聚合；每日 HMAC 密钥派生，过期计数在后续请求或 `prune` 清理 |
| 挑战 | 有效 180 秒；后续签发或 `prune` 删除过期记录 |
| 名称、评论、有效票 | 持续保留至运营者处理；普通访问不公开作者内部摘要 |
| 隐藏记录和管理操作记录 | 持续保留以供恢复和审计；隐藏不释放容量，防止反复提交占用 |
| Cookie | 180 天，签名随机身份；没有读取用户其他站点身份的追踪代码 |
| 数据库/备份 | DB 逻辑上限 256 MiB；建议每日备份，保留最近 14 天，月度备份保留 6 份 |

IPv6 `/64` 或同一公网 IPv4 下多人共用配额，可能影响校园/公司网络用户；需要根据实际日志中的限流计数和流量调整，不能简单把 IP 当作“一人”。配额计数与内容写入处于同一 `BEGIN IMMEDIATE` 事务；唯一约束及复合外键同时保障重放/并发不会增加重复票或跨画投票。

应用不记录请求 IP、Cookie、提交文本和凭据。Nginx API location 应关闭访问日志或使用匿名化日志；服务器系统级运维日志策略由发布会话检查。HTTPS 和限流不能替代内容管理；站点运营者应定期检查新内容、备份及磁盘余量。

## 生产安装示例（由发布会话执行）

建议路径：代码 `/opt/eytle-museum/museum_guest_api.py`，数据库 `/var/lib/eytle-museum/guestbook.sqlite3`，密钥 `/etc/eytle-museum.env`，静态页面 `/var/www/eytle.cn`。这些私有路径不可位于公开 web root。发布脚本通过 `scripts/deploy-excludes.txt` 排除 `server/`、数据库和环境文件；服务源码由发布流程单独安装到 `/opt`，不要把 DB 加入网站 Git 仓库。

首次安装建立 `museum-guest` 系统用户，`/opt/eytle-museum` 由 root 所有，仅允许服务读取；`/var/lib/eytle-museum` 由服务用户所有，目录权限 0700。下面的密钥生成脚本将值写入私有文件，不打印到终端：

```bash
sudo python3 - <<'PY'
import os, secrets
fd = os.open('/etc/eytle-museum.env', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as out:
    out.write('MUSEUM_SECRET=' + secrets.token_hex(32) + '\n')
    out.write('MUSEUM_ORIGIN=https://eytle.cn\n')
PY
```

示例 `/etc/systemd/system/eytle-museum.service`（先核对实际静态目录与 Python 路径）：

```ini
[Unit]
Description=Eytle museum visitor guestbook
After=network.target

[Service]
Type=simple
User=museum-guest
Group=museum-guest
EnvironmentFile=/etc/eytle-museum.env
ExecStart=/usr/bin/python3 /opt/eytle-museum/museum_guest_api.py serve --db /var/lib/eytle-museum/guestbook.sqlite3 --public-root /var/www/eytle.cn --port 8765 --trust-proxy
WorkingDirectory=/opt/eytle-museum
StateDirectory=eytle-museum
StateDirectoryMode=0700
UMask=0077
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/eytle-museum
RestrictAddressFamilies=AF_INET AF_UNIX
MemoryMax=256M
TasksMax=48
LimitNOFILE=256

[Install]
WantedBy=multi-user.target
```

`--trust-proxy` 只可用于前端 Nginx **覆盖** `X-Real-IP` 的部署。本机其他进程可以访问 loopback，但公网客户端不能直接访问 8765；安全组/防火墙不要开放该端口。只有明确受信任的 CDN 才能配置 Nginx real-IP 模块，不能信任访客自行传入的代理头。

Nginx 的 `http` 级别增加：

```nginx
limit_req_zone $binary_remote_addr zone=museum_requests:10m rate=3r/s;
limit_conn_zone $binary_remote_addr zone=museum_connections:10m;
```

在已经配置 TLS 的 `eytle.cn` server 中增加：

```nginx
location ^~ /api/museum/v1/ {
    client_max_body_size 4k;
    client_body_timeout 8s;
    limit_req zone=museum_requests burst=15 nodelay;
    limit_req_status 429;
    limit_conn museum_connections 6;
    limit_conn_status 429;
    proxy_connect_timeout 2s;
    proxy_read_timeout 10s;
    proxy_send_timeout 10s;
    proxy_request_buffering on;
    proxy_pass http://127.0.0.1:8765;
    proxy_set_header Host eytle.cn;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For "";
    access_log off;
    error_page 429 = @museum_rate_limit;
    error_page 502 503 504 = @museum_unavailable;
}
location @museum_rate_limit {
    default_type application/json;
    add_header Cache-Control no-store always;
    add_header Retry-After 60 always;
    return 429 '{"error":{"code":"rate_limited","message":"Please try again later.","retryAfter":60}}';
}
location @museum_unavailable {
    default_type application/json;
    add_header Cache-Control no-store always;
    return 503 '{"error":{"code":"service_busy","message":"The guestbook is temporarily unavailable."}}';
}
location ^~ /server/ { return 404; }
```

不要启用公共 CORS、不要设置 `proxy_intercept_errors on` 覆盖应用的精确错误/等待秒数，不要缓存 API。`www` 等别名应先重定向到 `https://eytle.cn`；如果确实使用另一个域名，必须同时调整 `MUSEUM_ORIGIN`、Nginx Host 和站点入口。

发布核对包括：`nginx -t`、服务健康检查、正式域名上的 Cookie 属性、独立两个浏览器的取名/投票/评论及共享结果、重复提交/限流、停止后端时界面错误、重启后数据仍在，以及公网访问不到数据库/代码/密钥。服务启动后才能把前端交互视为正式可用；仅部署静态文件不算完成存储接入。

## 内容管理、备份和恢复

CLI 只在服务器本机使用，没有公开管理接口。管理员执行命令时应通过受控环境加载 `/etc/eytle-museum.env`，命令行不要携带密钥值；例如 root 的维护 shell 使用 `set -a`、`. /etc/eytle-museum.env`、`set +a`，或者使用 systemd 一次性维护单元的 `EnvironmentFile=`。以下示例省略重复的服务环境加载步骤：

```bash
python3 /opt/eytle-museum/museum_guest_api.py list \
  --db /var/lib/eytle-museum/guestbook.sqlite3 --public-root /var/www/eytle.cn \
  --kind name --artwork 0x0001.jpg --offset 0

python3 /opt/eytle-museum/museum_guest_api.py moderate \
  --db /var/lib/eytle-museum/guestbook.sqlite3 --public-root /var/www/eytle.cn \
  --kind name --id 12 --hidden yes

python3 /opt/eytle-museum/museum_guest_api.py moderate \
  --db /var/lib/eytle-museum/guestbook.sqlite3 --public-root /var/www/eytle.cn \
  --kind comment --id 34 --hidden no

python3 /opt/eytle-museum/museum_guest_api.py backup \
  --db /var/lib/eytle-museum/guestbook.sqlite3 --public-root /var/www/eytle.cn \
  --destination /var/backups/eytle-museum/guestbook-2026-09-22.sqlite3

python3 /opt/eytle-museum/museum_guest_api.py prune \
  --db /var/lib/eytle-museum/guestbook.sqlite3 --public-root /var/www/eytle.cn
```

`list` 每次最多 100 条且包含隐藏项；用 `--offset 100` 查看下一页。`moderate --hidden yes` 立即使该内容从公共查询中消失，获胜名重新计算，不需要清缓存或重启。恢复隐藏名称时其原有票数恢复参与排名。修改会写入 moderation 审计表。已打开的客户端在下一次读取/刷新后看到新的结果，不宣称 WebSocket 式即时推送。

`backup` 使用 SQLite 在线备份 API，而非直接复制正使用 WAL 的文件。目标必须是新文件且位于公共目录之外，权限为 0600，备份应复制到可信的独立存储，别通过公开网站下载。安排每日备份和 `prune`；按保留策略由运维任务删除过期备份，不要自动删除用户内容。定期执行 `PRAGMA integrity_check` 验证一份备份并演练恢复。

恢复步骤：停止服务；另存当前 DB、`-wal`、`-shm` 以便回退；将已验证备份放到私有 DB 路径，清除对应旧 WAL/SHM（服务停止后）；检查所有者和 0600 权限；保留原密钥文件；重启服务并核验数据。不要在服务仍运行时覆盖 SQLite 文件。磁盘满、配额达上限或数据库异常时写入返回明确错误，先备份和诊断，再决定容量扩展或人工归档。

## 技术依据

SQLite 的参数绑定、显式事务与 `Connection.backup()` 参照 [Python sqlite3 文档](https://docs.python.org/3/library/sqlite3.html)。Cookie 的 HttpOnly、SameSite、Secure、Path 语义参照 [MDN Set-Cookie 文档](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)。这些措施用于不同环节，不能将某一个 Cookie 标记当作完整 CSRF 或反机器人的替代品。

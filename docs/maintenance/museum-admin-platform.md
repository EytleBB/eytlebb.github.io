# 图画展览会管理后台

本功能在 `/museum-admin` 提供浏览器管理页面，使用现有展馆 Python/SQLite 服务的私有 API。访客取名、投票和评论仍使用原公开接口。后台页面的 HTML/CSS/JS 可被读取，但任何账号、内容管理和审计数据都要求登录；生产数据库、会话和密钥仍放在网站根目录之外。

## 功能与规则

- 按画作编号或当前名字查找，查看缩略图、全部候选名、真实访客票数、展示票数、评论和隐藏状态。每次加载各最多 100 条，可继续分页。
- 名字和评论可以编辑、隐藏、恢复、永久删除。编辑沿用访客文本校验和同画去重。隐藏名不参与获选；永久删除名字时，其访客投票随外键一起删除。
- 管理员可直接设置某名字的**当前展示票数**。服务记录设置当时的真实票数，以后访客投票、撤票和改投继续使展示票数加减；真实票数保留在后台可核对，公开页面只显示展示票数。展示票数最低为 0。
- 管理员可手动选一个可见名字为当前获选名，不改变票数。下一次访客投票、撤票或改投后清除手动选择，重新按展示票数排名。同票沿用原先的先提交优先规则。也可随时点击“恢复按票数选名”。
- 删除操作记录保存账号、动作、目标编号和时间，不保存被删除的正文；编辑日志只保存修改前后长度。当前数据库中已删除的正文不能在网页后台撤销。需要从删除前的数据库备份恢复；**整库恢复会回退备份之后的其他内容**，应先保存当前数据库并制定合并方案。
- 第一个账号是所有者，通过服务器本机 CLI 创建。所有者可在网页中新建、停用、启用管理员和重置其密码；普通管理员可管理展馆内容，但不可管理账号。停用或重置密码会立即撤销该账号的现有会话。忘记所有者密码时，可在服务器本机用 CLI 恢复。

## 登录与安全

密码至少 12 字符，最多 128 字符，使用随机盐 `scrypt` 存储。登录按 IP 和账号限速；会话使用随机令牌，数据库只存其 SHA-256，Cookie 为 HttpOnly、SameSite=Strict、API 管理路径作用域，生产环境还带 Secure。会话最长 12 小时，闲置 30 分钟后失效。修改请求要求同源 Origin 和会话 CSRF 令牌。前端用 `textContent` 显示访客内容。生产 `/museum-admin` 路由带独立 CSP 和 `no-store`；没有公开注册或重置密码接口。

匿名访客投票仍是现有模型，展示票数可与真实票数不同。后台会明确标记调票。管理员应谨慎使用调票功能，因为展示票数影响获选名，也会被访客看见。

## 本地验证

先启动开发服务，数据库和开发密钥必须在源码与网站根目录之外：

```sh
python3 server/museum_guest_api.py serve --db /tmp/eytle-admin-preview/guestbook.sqlite3 --dev-static --port 8001
```

在另一终端创建初始所有者；服务已启动也可运行，密码由终端隐藏输入：

```sh
python3 server/museum_guest_api.py admin-bootstrap --db /tmp/eytle-admin-preview/guestbook.sqlite3 --dev-static --port 8001 --username owner
```

打开 `http://127.0.0.1:8001/museum-admin.html`。该开发静态入口直接访问文件名；正式环境使用 `/museum-admin`。

测试命令：

```sh
python3 -m unittest discover -s tests -p 'test_museum_guest_api.py' -v
node --check js/museum-admin.js
```

## 发布交接

本功能工作树不推送 `origin` 或 `tencent`。由 **“Eytle 网站发布会话”** 审查提交、备份生产数据库、更新 `/opt/eytle-museum/museum_guest_api.py`、重启服务并验证旧数据库从 schema v1 升至 v2。首次升级前先用在线备份脚本留存独立快照；数据库不纳入静态 Git 部署。随后安装更新后的 `scripts/production/site-routes.conf` 到 Nginx snippet，运行 `nginx -t` 并 reload，最后发布静态 `museum-admin.html`、`css/museum-admin.css` 和 `js/museum-admin.js`。先验证 HTTPS 管理接口的 Cookie/CSRF、未登录 401、登录及管理动作，再开放使用。

生产初始所有者需要在服务器维护 shell 中加载现有 `/etc/eytle-museum.env`，使用 `admin-bootstrap --db /var/lib/eytle-museum/guestbook.sqlite3 --public-root /var/www/eytle.cn --username <name>` 创建。密码通过 `getpass` 隐藏输入，不放入命令行或 Git。调用者必须能读写私有数据库，且与运行服务的系统用户／权限策略一致。所有者密码应丢失时，可用同样环境运行 `admin-reset-password --username <name>`；该操作撤销旧会话并写入审计。

不要在纯静态预览、GitHub Pages 或未升级 API 的服务器上将后台视为可用。旧 `moderate` CLI 仍能使用，隐藏操作也会写入新审计记录。

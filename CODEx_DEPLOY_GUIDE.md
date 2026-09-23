# Eytle.cn 网站维护与部署说明

> 给本地 Codex / AI 助手使用的项目说明。执行网站维护、修改、部署前，先阅读本文件。

## 2026-09-22：当前发布入口

简洁网址使用 `/`、`/projects`、`/tools`、`/patchlog`、`/gallery`、`/downloads`、`/museum`、`/mc-calc` 和 `/museum-admin`。前六个由同一个首页脚本解析，后三个为独立 HTML 页面。`index.html`、`museum.html`、`mc-calc.html`、`museum-admin.html` 及路径末尾斜杠会重定向；旧 `#分区` 链接由前端转换，并保留查询参数。管理员页面的登录、数据库升级与发布步骤见 [管理后台说明](docs/maintenance/museum-admin-platform.md)。

首次启用简洁网址时，将当前提交的 `scripts/production/` 放入服务器私有目录，以 sudo 执行其中的 `install_routes.py`。它备份并更新本站 Nginx 配置、检查语法后 reload，不操作留言数据库。必须先启用服务器路由，再发布前端。规则只映射明确列出的页面，未知 URL 和缺失资源仍返回 404。后续普通页面修改无需重装路由；静态本地预览使用 `python3 scripts/preview.py --port 8000`，留言 API 开发仍使用独立服务。

本机普通 GitHub HTTPS 推送认证已经恢复，使用 `git push origin main`，成功后再执行 `git push tencent main`，两端必须是同一提交。下文 9 月 12 日的 API 推送说明仅为历史记录。完整发布流程见 [发布约定](docs/maintenance/release-workflow.md)。

展馆取名、投票、评论增加了独立 Python/SQLite 服务；静态网站推送不会自动安装或更新后端。实际配置模板及首次安装脚本在 `scripts/production/`。将待发布提交中的 `server/`、`scripts/production/`、`scripts/deploy-excludes.txt` 上传到服务器私有发布目录后，以 sudo 执行该目录的 `scripts/production/install_guestbook.py`。脚本会先备份现有网站和配置，生成仅存于服务器的密钥，验证 Nginx/systemd 配置，再启用服务；安装后必须验收 HTTPS API、数据库持久化及备份，之后才推送静态页面。

服务为 `eytle-museum.service`，代码在 `/opt/eytle-museum`，数据在 `/var/lib/eytle-museum`，环境文件为 `/etc/eytle-museum.env`。`eytle-museum-backup.timer` 每日服务器时间 04:20 起随机延迟最多 5 分钟执行在线备份并检查完整性，保留最近 14 个每日快照和 6 个月度快照；备份在 `/var/backups/eytle-museum`。`www.eytle.cn` 的 HTTPS 访问统一跳转主域名以保持留言来源一致。详情见 [留言服务手册](docs/maintenance/museum-guestbook-service.md)。

后续后端升级前，先运行一次备份服务，再更新 `/opt/eytle-museum` 内的对应文件并重启、验证 API；不要覆盖密钥或数据库。首次安装脚本的站点归档不包含独立数据库，不能代替数据库在线备份。

## 2026-09-12：重装系统后的本地入口

当前开发环境为 Linux，工作目录是 `/home/yeom/Documents/ChatGPT/thisIsEytle`。下文保留原 Windows 部署记录，其中的 `D:\eyt_web` 和 PowerShell 示例应换用当前目录与 Bash。迁移与版本核对详情见 [恢复记录](docs/maintenance/2026-09-12-recovery.md)。

```bash
cd /home/yeom/Documents/ChatGPT/thisIsEytle
git status
node --test tests/*.test.js
python3 scripts/preview.py --port 8000
```

浏览器访问 `http://127.0.0.1:8000/`；按 `Ctrl+C` 停止预览。生成画廊预览使用 `python3 scripts/gallery-previews.py`，图片重命名仍使用 `node scripts/gallery-renamer.js`。

项目 Git 提交身份、`.githooks` 路径和旧工作树路径已恢复。`origin` 和 `tencent` 均保留；此次没有推送或部署。2026-09-12 已配置本机专用 Ed25519 密钥，并通过全新连接验证密钥登录。现在直接使用：

```bash
ssh eytle-server
```

持久设置保存在本机 `/home/yeom/.ssh/config`，同时匹配 `eytle-server` 和 `81.71.120.60`。其中包含专用私钥 `/home/yeom/.ssh/id_ed25519_eytle_server`、`BindInterface wlp0s20f3`、`ControlMaster auto` 和 `ControlPersist 10m`。网卡绑定解决了最初 Mihomo TUN 导致的 SSH 超时；改用其他网卡时需更新 `BindInterface`。

已移除仓库里临时的 `core.sshCommand` 覆盖，`git ls-remote tencent` 已通过，新任务和普通 SSH 均可使用上述持久配置。连接过期后可重新用密钥认证，无需输入服务器密码。私钥权限为 `600`，未设置额外口令以支持非交互连接；只存放在本机 `.ssh`，公钥已追加到服务器 `ubuntu` 用户的 `authorized_keys`，原密码登录方式和已有公钥保留。

在 Codex 的 SSH 设置中可选择别名 `eytle-server`；手动添加时主机填 `ubuntu@81.71.120.60`、端口 `22`，Identity 指向上述私钥文件（不带 `.pub`）。SSH 密钥配置不等于远程 Codex 环境已经安装；远程项目功能仍需另行安装并登录服务器上的 Codex CLI。

已通过共享 SSH 连接直接核对：服务器裸仓库 `main` 与部署工作目录 `HEAD` 都是 `5df346d`，部署工作目录无未提交改动；线上目录的 10 个核心文件 SHA-256 与本地完全一致。`post-receive` hook 存在且可执行，但此次未触发部署。GitHub 写入认证尚未验证。

## 本次双升级同步（2026-09-12）

森林首页和 Nocturne 展馆来自同一工作目录中的两个任务，按一个完整版本同步，新增 JS 模块、WebP 和字体必须一起发布。内容和整合检查见 [同步记录](docs/maintenance/2026-09-12-sync.md)。上方 `5df346d` 是恢复时的基线，当前版本以 `git log -1` 为准。

部署排除规则现由仓库的 `scripts/deploy-excludes.txt` 维护，发布前同步到 `/srv/eytle-site/deploy-excludes.txt`。维护文档、测试、脚本只保留在源码仓库。新加排除规则不会自动清理已在线的同名文件；首次调整时先备份，再移出网站目录。

本机 HTTPS Git 暂无写入凭据；此次可使用已连接的 EytleBB GitHub 账号，通过 Git blob/tree/commit API 发布完整源码树，使用非强制的 ref 更新，再 fetch 同一提交到本地并 push 到腾讯云。此方式不代表本机 `git push origin main` 的认证已恢复。后续优先使用配置好认证的普通 Git 推送；不要把令牌放进 remote URL 或仓库。

## 1. 项目基本信息

本项目是 `eytle.cn` 个人网站源码仓库。

- 本地仓库路径：`D:\eyt_web`
- GitHub 仓库：`https://github.com/EytleBB/eytlebb.github.io`
- GitHub 用户名：`EytleBB`
- Git 提交邮箱：`3035986089@qq.com`
- 腾讯云服务器：`ubuntu@81.71.120.60`
- 服务器 Git 接收仓库：`/srv/eytle-site/site.git`
- 服务器部署工作目录：`/srv/eytle-site/repo`
- 网站线上目录：`/var/www/eytle.cn`
- Nginx 网站根目录：`/var/www/eytle.cn`

服务器访问 GitHub 不稳定，所以本项目不采用“服务器从 GitHub pull”的部署方式，而是采用“本地直接 push 到腾讯云服务器”的方式部署。

## 2. 当前部署架构

```text
本地 D:\eyt_web
   ├─ git push origin main   → GitHub 仓库
   └─ git push tencent main  → 腾讯云服务器裸仓库

腾讯云服务器：
/srv/eytle-site/site.git
   ↓ post-receive hook 自动触发
/srv/eytle-site/repo
   ↓ rsync 同步
/var/www/eytle.cn
```

### 重要原则

不要在 `/var/www/eytle.cn` 里执行 `git init`。

不要把 `/var/www/eytle.cn` 当作开发仓库。

不要直接把 `.git`、README、维护文档、AI 配置文件部署到网站根目录。

正式修改优先在本地 `D:\eyt_web` 完成，再提交并推送。

## 3. 日常本地更新流程

在 Windows PowerShell 中执行：

```powershell
cd D:\eyt_web

git status
git add .
git commit -m "update site"

git push origin main
git push tencent main
```

含义：

- `origin`：GitHub 仓库。
- `tencent`：腾讯云服务器仓库。
- `git push tencent main` 成功后，服务器会自动部署到 `/var/www/eytle.cn`。

也可以使用一行命令同时推送：

```powershell
git push origin main; git push tencent main
```

## 4. 检查 Git remote

在本地仓库执行：

```powershell
cd D:\eyt_web
git remote -v
```

应该看到类似：

```text
origin   https://github.com/EytleBB/eytlebb.github.io.git (fetch)
origin   https://github.com/EytleBB/eytlebb.github.io.git (push)
tencent  ubuntu@81.71.120.60:/srv/eytle-site/site.git (fetch)
tencent  ubuntu@81.71.120.60:/srv/eytle-site/site.git (push)
```

如果没有 `tencent`，添加：

```powershell
git remote add tencent ubuntu@81.71.120.60:/srv/eytle-site/site.git
```

## 5. 自动部署 hook

服务器上的 hook 文件位置：

```bash
/srv/eytle-site/site.git/hooks/post-receive
```

该 hook 的作用：

1. 接收本地 push 到服务器裸仓库的 `main` 分支。
2. 更新 `/srv/eytle-site/repo` 工作目录。
3. 用 `rsync` 将网站文件同步到 `/var/www/eytle.cn`。
4. 根据 `/srv/eytle-site/deploy-excludes.txt` 排除不应公开的文件。

当前 hook 内容应类似：

```bash
#!/bin/bash
set -e

# 避免 bare repo hook 的环境变量影响下面的工作仓库操作
unset GIT_DIR
unset GIT_WORK_TREE

TARGET_BRANCH="refs/heads/main"
REPO_DIR="/srv/eytle-site/repo"
WEB_DIR="/var/www/eytle.cn"
EXCLUDES="/srv/eytle-site/deploy-excludes.txt"

while read oldrev newrev refname
do
  if [ "$refname" = "$TARGET_BRANCH" ]; then
    echo "Deploying main to $WEB_DIR ..."

    git -C "$REPO_DIR" fetch origin main
    git -C "$REPO_DIR" reset --hard origin/main

    rsync -avc --delete \
      --exclude-from="$EXCLUDES" \
      "$REPO_DIR/" \
      "$WEB_DIR/"

    echo "Deployment finished."
  else
    echo "Ignoring push to $refname"
  fi
done
```

如果 hook 被修改或损坏，可以在服务器上重写该文件，然后执行：

```bash
chmod +x /srv/eytle-site/site.git/hooks/post-receive
```

检查 hook 权限：

```bash
ls -l /srv/eytle-site/site.git/hooks/post-receive
```

前面应包含 `x`，例如：

```text
-rwxrwxr-x ... post-receive
```

## 6. 部署排除规则

服务器部署排除文件：

```bash
/srv/eytle-site/deploy-excludes.txt
```

当前完整内容以仓库 `scripts/deploy-excludes.txt` 为准，包括以下基础规则：

```text
.git/
.github/
.gitignore
.githooks/
README.md
CLAUDE.md
维护手册.md
docs/
deploy/
.claude/
.superpowers/
shots/
```

这些文件可以存在于 Git 仓库中，但不会发布到 `https://eytle.cn/` 网站根目录。

如果新增了维护文档、AI 配置目录、构建草稿目录，记得同步加入排除列表。

## 7. 服务器常用检查命令

### 检查服务器工作目录版本

```bash
cd /srv/eytle-site/repo
git status
git log --oneline -5
```

### 检查服务器裸仓库版本

```bash
git --git-dir=/srv/eytle-site/site.git log --oneline -5 main
```

### 检查线上网站目录

```bash
ls -la /var/www/eytle.cn | sed -n '1,60p'
```

线上目录不应该出现：

```text
.git
README.md
CLAUDE.md
维护手册.md
docs
```

### 检查 hook 内容

```bash
ls -l /srv/eytle-site/site.git/hooks/post-receive
sed -n '1,160p' /srv/eytle-site/site.git/hooks/post-receive
```

### 检查 Nginx root

```bash
sudo nginx -T 2>/dev/null | grep -E "server_name|root|listen" | sed -n '1,160p'
```

应能看到：

```nginx
server_name eytle.cn www.eytle.cn;
root /var/www/eytle.cn;
```

## 8. 手动同步方法

如果自动部署失败，但服务器裸仓库已经收到最新提交，可以手动同步：

```bash
cd /srv/eytle-site/repo

git fetch origin main
git reset --hard origin/main

rsync -avc --delete \
  --exclude-from=/srv/eytle-site/deploy-excludes.txt \
  /srv/eytle-site/repo/ \
  /var/www/eytle.cn/
```

然后检查：

```bash
cd /srv/eytle-site/repo
git log --oneline -3
```

## 9. 故障处理

### `Everything up-to-date`

本地执行：

```powershell
git push tencent main
```

如果输出：

```text
Everything up-to-date
```

说明本地没有新的提交要推送，所以服务器 hook 不会触发。这不是错误。

如需测试 hook，可创建一个空提交：

```powershell
cd D:\eyt_web
git commit --allow-empty -m "Test deploy hook"
git push tencent main
```

正常情况下，PowerShell 会看到：

```text
remote: Deploying main to /var/www/eytle.cn ...
remote: Deployment finished.
```

注意：hook 输出显示在本地 PowerShell 的 `git push` 输出中，不会显示在已经打开的服务器 SSH 窗口里。

### `fatal: not a git repository: '.'`

如果 `git push tencent main` 时看到：

```text
remote: fatal: not a git repository: '.'
```

通常是 hook 受裸仓库环境变量影响。解决方法是在 hook 开头加入：

```bash
unset GIT_DIR
unset GIT_WORK_TREE
```

并使用：

```bash
git -C "$REPO_DIR" fetch origin main
git -C "$REPO_DIR" reset --hard origin/main
```

不要使用依赖当前目录状态的普通 `git fetch`。

### 服务器无法 clone GitHub

如果服务器执行：

```bash
git clone https://github.com/EytleBB/eytlebb.github.io.git repo
```

出现连接 GitHub 超时，说明服务器访问 GitHub 不稳定。本项目已经改为本地直接 push 到腾讯云服务器，不依赖服务器访问 GitHub。

### 服务器工作目录落后

检查：

```bash
git --git-dir=/srv/eytle-site/site.git log --oneline -3 main
cd /srv/eytle-site/repo
git log --oneline -3
```

如果 `site.git` 比 `/srv/eytle-site/repo` 新，说明服务器裸仓库收到了提交，但部署工作目录没有更新。可使用“手动同步方法”。

## 10. 服务器临时修改规则

原则上不要直接修改：

```bash
/var/www/eytle.cn
```

该目录是线上运行目录，会被下次部署覆盖。

所有正式修改应在本地完成：

```powershell
cd D:\eyt_web
# 修改文件
git add .
git commit -m "update site"
git push origin main
git push tencent main
```

如果确实在服务器线上目录临时改了文件，必须先把改动合并回本地仓库或服务器工作仓库，否则下次部署会覆盖这些修改。

## 11. 关于内容更新和网站更新

网站更新主要分两类：

1. 内容更新：日志、图片、分享内容等。
2. 网站结构更新：HTML、CSS、JS、界面优化等。

两类都应通过 Git 记录变更。

建议提交信息示例：

```text
add new log entry
update gallery images
improve homepage layout
fix museum script
update site content
```

## 12. 安全提醒

不要提交：

```text
.env
服务器密码
SSH 私钥
API key
数据库密码
临时敏感文件
```

不要执行危险操作，除非已经备份并明确知道后果：

```bash
rm -rf /var/www/eytle.cn
rm -rf /srv/eytle-site/site.git
git push --force
```

不要把维护文档、AI 配置、部署脚本随意暴露到网站根目录。

## 13. 当前已验证状态

已验证成功的自动部署输出示例：

```text
remote: Deploying main to /var/www/eytle.cn ...
remote: From /srv/eytle-site/site
remote:  * branch            main       -> FETCH_HEAD
remote: HEAD is now at 8b456d3 Test deploy hook fixed
remote: sending incremental file list
remote: Deployment finished.
```

说明以下链路已经打通：

```text
D:\eyt_web
  → git push tencent main
  → /srv/eytle-site/site.git
  → post-receive hook
  → /srv/eytle-site/repo
  → /var/www/eytle.cn
```

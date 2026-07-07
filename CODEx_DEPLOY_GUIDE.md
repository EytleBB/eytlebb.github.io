# Eytle.cn 网站维护与部署说明

> 给本地 Codex / AI 助手使用的项目说明。执行网站维护、修改、部署前，先阅读本文件。

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

当前内容应类似：

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

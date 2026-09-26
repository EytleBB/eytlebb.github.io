# 网站与个人内容分仓

## 所有权与运行方式

| 仓库 | 维护内容 | 网站公开路径 |
| --- | --- | --- |
| `eytlebb.github.io` | 页面、样式、JS、留言服务、字体、图标、森林背景、模型、`files/730.zip` | 原网站路径 |
| `Eytle-Patch-Log` | `logs/` 中的正文、示例和自动索引 | `/logs/` |
| `Eytle-Museum` | `images/gallery/` 原图、`images/gallery-preview/` 预览和索引、`audio/museum.mp3` | 原图片和音乐路径 |

主站只保存 `content-sources.json`，其中记录内容仓库 URL 和完整提交 SHA。
不使用跨域 GitHub/raw/CDN 请求。`scripts/assemble-site.py` 从本地内容仓库的指定提交
导出公开数据，校验文章索引、图片索引、原图 SHA-256、预览大小及尺寸元数据，
然后与网站代码组成一个独立发布目录。服务器不需要连接 GitHub。

`/gallery`、首页、灯箱、3D 展馆、管理员预览和留言 API 的路径及作品 ID 保持不变。
原图名称不能随意改动，否则旧评论可能无法关联。TIFF 原图也保留，只是不列入网页图片索引。
不改写旧 Git 历史；主仓库的新版本不再跟踪内容，历史版本仍保留旧文件。

## 日常维护

日志和图片的索引生成脚本、提交 hook 随内容迁入对应仓库。克隆内容仓库后执行：

```bash
git config core.hooksPath .githooks
```

日志：新增 `Eytle-Patch-Log/logs/YYYY-MM-DD.txt`，运行该仓库的
`python3 scripts/update-index.py`，检查并提交正文和索引。

图片：放入 `Eytle-Museum/images/gallery/`，运行该仓库的
`node scripts/gallery-renamer.js --once` 和 `python3 scripts/gallery-previews.py`，
检查并提交原图、索引和预览。删除图片时一并删除对应预览文件。
音乐也在该仓库的 `audio/museum.mp3` 更新。

内容提交完成后，把需要上线的完整 SHA 写入主站 `content-sources.json` 并提交。
这是网站发布所用的内容版本；内容仓库分支继续前进不会悄悄改变线上内容。
组装忽略内容仓库的未提交改动，也不从主仓库旧工作区拾取残留素材。
主站的提交 hook 会阻止再次暂存日志、展览原图、预览和音乐。

## 本地完整预览

```bash
python3 scripts/assemble-site.py \
  --logs-repo ../Eytle-Patch-Log \
  --museum-repo ../Eytle-Museum \
  --output /tmp/eytle-preview-unique
python3 scripts/preview.py --root /tmp/eytle-preview-unique --port 8000
```

组装需要 Python 3.9+、Git、rsync；内容图片生成另需 Node.js 和 Pillow。
输出必须位于三个仓库以外，且尚不存在，以免覆盖源文件或上次可用版本。
仓库 README、脚本、测试、内部文档、版本配置和 Git 元数据不会进入公开目录。
生成目录是可丢弃的发布产物，不能在那里直接维护日志或图片。

## 首次上线：只能由“Eytle 网站发布会话”执行

不能直接用旧 hook 推送拆分后的主站：旧 hook 只同步主仓库，会删除线上内容。
按下列顺序准备好内容和新 hook 后，才发布主站。

1. 审核三个仓库的功能提交。内容仓库以快进方式整合到 `main`，保留锁定 SHA，
   先推送各自 GitHub。主站功能提交由发布会话整合并全量测试。确认内容 SHA 都可从
   GitHub 获取后再发布引用它们的主站提交。功能任务本身不推送。
2. 在本地为两个已发布的内容提交分别创建完整 bundle（在各内容仓库运行
   `git bundle create /PRIVATE/PATH/Eytle-Patch-Log.bundle HEAD`，图片仓库同理）。
   用 `scp` 上传到服务器私有暂存目录，例如 `/srv/eytle-site/incoming/`，不得放入 web root。
3. 在服务器私有目录初始化两个 bare repo（仅首次）：

   ```bash
   mkdir -p /srv/eytle-site/content
   git init --bare /srv/eytle-site/content/Eytle-Patch-Log.git
   git init --bare /srv/eytle-site/content/Eytle-Museum.git
   git -C /srv/eytle-site/content/Eytle-Patch-Log.git fetch /srv/eytle-site/incoming/Eytle-Patch-Log.bundle HEAD:refs/heads/main
   git -C /srv/eytle-site/content/Eytle-Museum.git fetch /srv/eytle-site/incoming/Eytle-Museum.bundle HEAD:refs/heads/main
   ```

   核对两个仓库包含 `content-sources.json` 指定的完整 SHA。使用本地 bundle 避免服务器访问 GitHub。
   保留旧提交，便于回滚；不要覆盖或删除现有内容仓库。
4. 把待发布主站提交导出到服务器私有目录，运行其中的组装命令，使用上面两个 bare repo，
   输出到另一个新的私有目录。确认 40 篇日志、77 张原图、76 张预览和音乐齐全（这些数量仅为首次迁移基线）。
   与发布前文件逐一比对 SHA-256。运行完整主站 Node/Python 测试和图片仓库测试。
5. 备份 `/srv/eytle-site/site.git/hooks/post-receive`、`deploy-excludes.txt`、当前主站提交和公开网站内容，
   备份留在私有目录。由有权限的服务器用户安装待发布提交的模板：

   ```bash
   install -m 0755 /PRIVATE/RELEASE/scripts/production/post-receive /srv/eytle-site/site.git/hooks/post-receive
   bash -n /srv/eytle-site/site.git/hooks/post-receive
   ```

   保留服务器目录所有权，确认接收 push 的用户能写 `repo/`、web root 和 `deploy-excludes.txt`。
   新 hook 只处理 `main`，串行部署，从主站提交导出代码，先组装校验，再更新服务器工作区和网站。
   它也支持仍包含内容的旧主站提交，供迁移前版本回滚。
6. 确认工作区干净，先 `git push origin main`，成功后再 `git push tencent main`。
   主站两端必须是同一个提交。Nginx 和留言服务的数据路径不变，不需要改数据库或后台配置。
7. 验证主站本地/GitHub/Tencent bare/server checkout 的提交一致；验证两个内容仓库的 GitHub 和服务器
   bare repo 的锁定提交一致；检查首页、日志、图片、预览、音乐、管理员预览和留言 API。
   线上日志及所有迁移媒体的哈希必须与对应内容提交一致；内部版本文件和维护文档返回 404。
   发布验证记录、bundle 和校验清单都保留在私有目录。

## 后续发布与失败恢复

内容更新时先发布内容仓库，再把新内容提交导入服务器 bare repo，然后更新主站固定 SHA 并发布。
仅改网页时继续使用现有内容 SHA，无需再次传送素材。

新 hook 校验失败会在触碰服务器工作区和线上目录前停止。Git 的 `post-receive` 失败不撤销已接受的
bare repo 提交，因此出现错误时必须区分 bare repo 已更新和网站仍是旧版。补齐内容后，由发布会话
重新向 hook 输入旧 SHA、新 SHA、`refs/heads/main` 三列重试，或按既有发布恢复流程处理；
不要以一次 `Everything up-to-date` 判定上线成功。

站点发布仍使用 rsync，文件同步阶段沿用原来的更新方式。实际磁盘/权限错误需要检查 hook 输出，
必要时从已备份的完整站点恢复；内容校验通过不代表后续 rsync 必然成功。

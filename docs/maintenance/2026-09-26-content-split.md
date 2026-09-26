# 2026-09-26 内容分仓交接

## 本次实现

从主站基线 `adff4e9` 的独立功能工作区迁出 40 篇正式日志、日志示例及索引、
77 张原图（包含不在展览索引中的 `0x0041.tiff`）、76 张 WebP 预览及索引、
展馆音乐和音乐说明。`files/730.zip` 按用户确认保留；界面背景、图标、字体、模型保留。
主站不再跟踪这些个人内容；历史 Git 提交保留，不进行历史重写。

三个本地工作区都位于 `/home/yeom/.codex/worktrees/content-repositories/`：

| 仓库目录 | 本地分支 | 内容提交 |
| --- | --- | --- |
| `thisIsEytle` | `codex/content-repositories` | 本记录所在功能提交 |
| `Eytle-Patch-Log` | `codex/content-migration` | `7410cdaacf2fdf7aecb5ae0e8d5e221907e5f253` |
| `Eytle-Museum` | `codex/content-migration` | `0532fbbb388536c3b15cea99ebd440f78d211852` |

两个内容仓库均克隆自原有 GitHub 仓库，并保留原始 README 提交作为祖先。
素材复制后和内容提交后分别逐文件校验 SHA-256，199 个迁移文件完全一致。
主站 `content-sources.json` 固定上面两个内容提交；不能在内容提交发布前发布这个引用。

## 验证结果

- 主站 Node 测试：164 项通过。
- 主站 Python 测试：39 项通过，其中 11 项为分仓组装、部署和防止误提交内容的集成测试。
- 图片仓库内容测试：1 项通过；76 张预览全部复用，未重编码任何图片。
- 实际组装：40 篇日志、77 张原图、76 张预览和音乐齐全。公开产物中 198 个内容文件
  与迁移前逐字节一致；音乐 README 只保留在内容源码仓库，不公开。
- 本地 HTTP：23 项检查通过，包括主要页面、日志/图片/预览/音乐、保留的下载包，
  以及内部文件与未知路径的 404 检查。
- `bash -n scripts/production/post-receive`、主站提交 hook shell 语法和 `git diff --check` 通过。
- 模拟发布使用本地 bare 内容仓库，不访问 GitHub；内容缺失时原线上目录保持不变。

逐文件哈希、完整测试输出和 HTTP 明细保存在工作区父目录的
`migration-checksums.json`、`assembly-verification.json`、`node-tests.txt`、`python-tests.txt`，
不进入公开网站。完整预览产物为同级 `preview/`。

## 发布状态与下一步

本功能任务只完成本地拆分、测试和提交，没有推送任何仓库，也没有改动服务器或根工作区 `main`。

由 **“Eytle 网站发布会话”** 按 [内容分仓说明](content-repositories.md) 完成三仓库审核发布：
先发布内容提交、导入服务器私有 bare repo、备份并安装新 hook、预组装验证，
再整合主站并先推送 GitHub、后推送同一提交至腾讯云。禁止直接使用旧静态同步 hook
发布本次主站提交，否则新主站源树里没有内容，旧 hook 会把线上内容删掉。

留言数据库、作品 ID、Nginx 路由和公开资源 URL 不变；不需要改留言服务配置。

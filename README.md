# This is Eytle · eytle.cn

个人网站源码：HTML、CSS、JavaScript、3D 展馆、留言服务及网站界面资源。
没有前端编译步骤。个人内容由独立仓库维护：

| 内容 | 仓库 |
| --- | --- |
| 日志正文和日期索引 | [Eytle-Patch-Log](https://github.com/EytleBB/Eytle-Patch-Log) |
| 展览原图、WebP 预览、背景音乐 | [Eytle-Museum](https://github.com/EytleBB/Eytle-Museum) |

主仓库只在 `content-sources.json` 记录两个内容仓库的固定提交，不存放内容副本。
森林背景、图标、字体、展馆模型及 `files/730.zip` 仍属于本站资源。

## 本地预览

把两个内容仓库克隆到本站仓库的相邻目录，并获取 `content-sources.json` 指定的提交。
使用 Python 3、Git 和 rsync 组装完整网站，输出目录必须是源码仓库外尚不存在的新目录：

```bash
python3 scripts/assemble-site.py --output /tmp/eytle-preview
python3 scripts/preview.py --root /tmp/eytle-preview --port 8000
```

如果内容仓库不在相邻目录，向组装命令传入 `--logs-repo PATH --museum-repo PATH`。
只查看网站界面可直接运行 `python3 scripts/preview.py`；未组装内容时日志和展览不可用。
修改源码后需重新组装到新的预览目录；内容始终取固定提交，不读取未提交的素材修改。

## 维护与发布

新增日志或图片在对应内容仓库进行；各自的 README 包含生成索引和预览的命令。
发布流程见 [内容分仓说明](docs/maintenance/content-repositories.md) 和
[发布约定](docs/maintenance/release-workflow.md)。首次分仓发布必须先安装新的服务器 hook，
旧的直接同步主仓库的部署方式不适用于拆分后的版本。

```bash
node --test tests/*.test.js
python3 -m unittest discover -s tests -p 'test_*.py'
```

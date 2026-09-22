# 展馆功能分支的直白文案补丁

这两份补丁只修改中、英、韩三语的固定界面文字。它们不改交互、移动、渲染或服务端逻辑，也不改访客提交的名称和留言。首页预览本身未引入这两个功能分支；其已有展馆提示已在本轮直接修改。

| 补丁 | 原始提交 | 适用文件 |
| --- | --- | --- |
| `museum-source-feel.patch` | `f5687cd`（Repeat museum jumps while Space is held） | `js/museum.js` |
| `museum-visitor-plaques.patch` | `ad7a436`（Add museum visitor naming plaques and shared guestbook） | `js/museum.js`、`js/museum-guestbook.js`、`js/museum-plaques.js` |

## 应用时机

由“Eytle 网站发布会话”整合对应功能提交后，在仓库根目录检查并应用相应补丁：

```sh
git apply --check docs/maintenance/plain-copy/museum-source-feel.patch
git apply docs/maintenance/plain-copy/museum-source-feel.patch
git apply --check docs/maintenance/plain-copy/museum-visitor-plaques.patch
git apply docs/maintenance/plain-copy/museum-visitor-plaques.patch
```

每份补丁均由指定提交的 `git show` 原件生成，再通过 `git diff --no-index` 输出相对仓库路径。2026-09-22 已在各自提交的未修改文件副本上执行 `git apply --check`，两份均通过。其他功能工作区未被修改。

整合后的上下文可能不同，尤其首页修订也改了展馆入口说明。因此发布前须再次执行检查。发生冲突时，只迁移补丁中的固定界面文案，不用整份文件覆盖当前文件，不覆盖控制逻辑。若入口已经显示相同的直白说明，跳过对应文案段即可。保留新移动分支实际的 Shift 慢走、Ctrl 蹲下、Space 跳跃以及 E 操作，不能用首页预览的 Shift 快走说明覆盖它；右键说明需保留“按住放大”。

`museum-source-feel.patch` 仅处理该分支独有的入口引导句和鼠标视角控制失败提示。首页本轮已处理的进入、继续、返回、通用操作和加载错误文案未重复放进补丁。

`museum-visitor-plaques.patch` 将比喻、感受式按钮和铭牌术语改成名称、投票、留言及操作结果。空标题统一为“暂无获选名称”，因为存在候选名称但没有投票时也没有获选名称；不是“等待第一个名字”。投票规则说明同票时采用先提交的名称，与 `ad7a436` 的既有服务端排序一致。

发布会话完成整合后应检查三语入口、铭牌文字、加载状态和操作提示，并更新相关脚本及模块引用的缓存版本。补丁本身不改变模块引用，以避免与功能分支的缓存版本冲突。

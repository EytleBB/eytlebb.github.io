# 展馆手机模式 · 2026-09-26

基于 `main` 的 `ebb1650`，功能分支 `codex/museum-mobile`，独立工作树 `/home/yeom/.codex/worktrees/museum-mobile/thisIsEytle`。本任务只提交功能，不推送或部署；由“Eytle 网站发布会话”审查并集成。

## 交互与入口

- 首页的展览导航允许具有 WebGL2 的触屏设备进入 `/museum`；不支持 WebGL2 的设备继续使用图片网格。直接访问 `/gallery` 始终保留网格，可从展馆入口或暂停菜单的“浏览图片”链接进入。
- `(pointer: coarse)` 自动启用手机模式。`/museum?controls=touch` 可以在桌面预览同一套触控操作。
- 左侧为模拟量摇杆，滑动画面调整视角，两根手指可独立操作；另有查看/返回、按住放大、跳跃、蹲下和暂停按钮。查看按钮沿用中心瞄准与距离判定，画作和铭牌均可使用。
- 手机不请求 Pointer Lock。菜单与铭牌输入不会被移动控制抢走；取消指针、丢失捕获、暂停、后台切换和旋转均会释放触摸输入。
- 竖屏看画按画作宽高与相机比例调整距离；看画中旋转屏幕会重新取景。UI 支持中英韩、320px 窄屏、横竖屏与安全区。
- 模块加载失败、WebGL 上下文丢失时保留可操作的图片网格回退入口。

## 渲染范围

手机像素倍率不超过 1.25，画作纹理最长边为 1024，纹理各向异性最多 4；主场景和反射不分配 MSAA 采样，反射最长边预算为 768。保留 SMAA、灯光、雾、建筑、地面反射和原有首批 48 张纹理预加载。桌面继续使用原有分辨率、采样与反射预算。没有修改留言 API、数据或部署配置。

`js/museum-touch.js` / `css/museum-touch.css` 独立承载触摸 UI；`museum.js` 管理统一游览状态；`museum-player.js` 兼容模拟量输入；`museum-architecture.js` 接收手机反射预算。入口、模块与新样式均已处理缓存版本。

## 验证

- `node --test tests/*.test.js`：165 项通过，0 失败。
- 修改的 JavaScript 文件全部通过 `node --check`；`git diff --check` 通过。
- Chrome 手机模拟：390×844、320×568、844×390，DPR 2/3；实际场景呈现、双指同时移动与转向、取消输入、暂停恢复、看画往返、旋转后重新取景、铭牌打开/关闭均通过。
- 320×568 中英韩入口、设置和操作按钮通过布局检查；未出现溢出视口的操作按钮。
- 实际首页触屏入口、显式图片网格回退、WebGL 上下文丢失和模块网络失败回退通过；桌面 Pointer Lock、WASD 移动和暂停回归通过。浏览器测试无 JavaScript 页面错误。
- 实测手机路径 renderer DPR 为 1.25、主场景 MSAA 为 0、已加载画作纹理最长边为 1024。
- Codex 内置浏览器的普通本地预览已加载完成，入口按钮可用：`http://127.0.0.1:8767/museum?controls=touch`。

浏览器模拟不是实体 Android / iOS 的 GPU 性能测试。独立 Chrome 的 CDN 连接在本机失败，因此自动验收将项目固定的 Three.js 0.186.0 请求映射到从 npm 官方注册表下载的同版临时副本；未修改生产 importmap。静态预览没有运行留言 API，铭牌验证覆盖其离线提示与返回流程，未验证线上写入。Codex 内置浏览器预览使用原始 CDN 配置。

本机截图和结果：`/tmp/museum-mobile-qa/`；浏览器验收脚本：`/tmp/museum-mobile-browser.mjs`、`/tmp/museum-mobile-matrix.mjs`；前端测试日志：`/tmp/museum-mobile-all-tests.log`。这些文件位于公共站点之外；本文由既有 `docs/` 部署排除规则保护。

合并时注意另一个首页展览外观任务也修改了 `js/main.js` 和 `index.html`。此任务对 `main.js` 的改动仅在 `isMuseumCapable()`，对 `index.html` 的改动仅为脚本缓存版本；保留另一个任务的画廊内容及布局。

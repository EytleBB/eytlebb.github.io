# 展馆灯光边缘与地板光斑修复 · 2026-09-22

基于 `main` 的 `c42971f`，独立分支 `codex/museum-lighting-refinement`，工作树 `/tmp/eytle-museum-lighting-refinement`。本任务仅准备功能提交，未合并或推送；交由“Eytle 网站发布会话”整合。

## 问题与修改

用户反馈灯光边缘毛刺、画面模糊，以及地板金色圆环在行走中显得突兀。检查发现了几处相互叠加的问题：

- 泛光合成原来读取 `bloomComposer.renderTarget2`，其中既有模糊光晕，也有半分辨率的原始灯带。叠加到完整场景后，硬边被重复放大。现在只读取 r186 `UnrealBloomPass.renderTargetsHorizontal[0]` 的模糊结果，灯带本体只由完整分辨率场景绘制一次。
- 传给 `EffectComposer` 的自定义场景目标首帧只有 CSS 像素尺寸，HiDPI 下要等窗口改变才恢复正确尺寸。现在场景目标从首帧开始使用实际绘制像素，并在显示器 DPR 改变时一同更新。
- 主场景保留最多 4× MSAA，后处理增加 SMAA，按 r186 要求放在 OutputPass 之前。只有主场景目标分配多重采样，后处理的两个交换目标不分配重复 MSAA 缓冲。
- 地板反射从无 MSAA 改为最多 4× MSAA，最长边上限从 1024 调整为 1536；生成 mipmap，替换原先容易拖糊另一方向细节的三点对角模糊。反射仍逐呈现帧更新，不分配另一份完整 4K/HiDPI 场景。
- 拱肋灯条原先大部分埋在金属槽内。调整为完整露出 8 mm 发光面，并与槽保持 1 mm 间隔，避免被切出细碎亮边；拱顶与立柱仍共用轮廓位置，结构处于原有 0.4 m 碰撞余量内。
- 小于像素的石材颗粒逐渐回归平均值；地板接缝和细镶线按像素覆盖率过滤，降低远处闪烁。

地板的双金属圆环和环形投光已移除。现为灯具正下方、半径 1.65 m、中心稍亮且连续衰减的低强度暖色光斑。位置固定在世界坐标，以已有 14 m 灯具间隔布置；光柱和微尘使用同一衰减分布。没有屏幕朝向贴片、随时间变化的半径或新增动态光源。光斑保留合理透视，但不再有突出轮廓强调圆形/椭圆变化。

保留作品预览纹理、主场景 DPR 上限 2、半浮点目标、AgX、曝光、雾、空间比例、操作和长按空格连跳。没有降低作品清晰度或反射更新频率。抗锯齿和反射清晰度本身存在 GPU 成本；通过限定反射尺寸和取消后处理重复 MSAA 缓冲控制开销，不声称所有硬件均锁满帧率。

## 验证

- `node --test --test-isolation=none tests/*.test.js`：123 项全部通过。新增 4 项执行实际渲染初始化/生命周期代码的 VM 测试，覆盖首帧与 DPR 改变后的像素尺寸、目标纹理绑定时机、泛光来源、SMAA 顺序、渲染异常后的状态恢复，以及灯槽净空。
- 修改的四个 JS 模块通过 `node --check`；`git diff --check` 通过。
- 内置浏览器检查 1280×720 与 1920×960 的近景、远景、俯视和自动漫游。原金色圆环消失，光斑柔和固定，灯带和反射边缘改善；未采用整屏模糊遮盖锯齿。极远的亚像素结构仍受显示分辨率限制。
- 最终 1920×960、DPR 1、60 FPS 上限漫游超过 200 m：最近 600 帧的间隔 p95 20.9 ms、p99 21.0 ms、最大 27.8 ms，超过 25 ms 共 3 帧、超过 40 ms 为 0；取样帧 694 次绘制、413530 三角形、235 张纹理、180 个几何对象，CPU 渲染调用段 9.1 ms。累计 64 次纹理上传、13 次区段回收。此单机窗口并非 GPU 计时，也没有相同位置的严格 A/B 基线，不能推导性能提升百分比。
- 最终修复版加载与漫游未产生新的浏览器错误或警告。开发过程曾出现一次渲染目标纹理被 UniformsUtils 克隆的警告；已改为 ShaderPass 初始化后绑定纹理，并加入回归覆盖。浏览器跨导航保留的旧日志时间为 08:29:35 UTC，不属于最终版本。
- 内置浏览器仍不支持正常 Pointer Lock；行走验证使用已有 `?perf=walk`，不声称完成手动鼠标锁定验收。操作代码未改。

预览入口：`http://127.0.0.1:8770/museum.html`，避免用 `file://` 打开模块页面。测试结束已恢复普通入口并重置临时窗口尺寸。

新增 `?perf=still&z=-14&pitch=-0.2&yaw=0` 固定视角诊断便于复查同一画面；位置与角度有边界限制，不影响普通入口。`data-perf.scenePixels` 报告实际后处理尺寸，诊断数据不进入游客界面。

## 发布范围

一同发布 `museum.html`、`js/museum.js`、`js/museum-architecture.js`、`js/museum-atmosphere.js`、`js/museum-lighting-layout.js`；内部模块版本统一为 `lighting-20260922-r5`。新增 SMAA 使用既有 importmap 锁定的 Three.js r186，无新的框架或构建步骤。测试和本记录继续由既有部署排除规则隔离。访客铭牌、留言服务、主页和作品资源未修改。

接口核对：[r186 UnrealBloomPass](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/postprocessing/UnrealBloomPass.js)、[r186 EffectComposer](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/postprocessing/EffectComposer.js)、[r186 SMAAPass](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/postprocessing/SMAAPass.js)、[r186 Reflector](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/objects/Reflector.js)。

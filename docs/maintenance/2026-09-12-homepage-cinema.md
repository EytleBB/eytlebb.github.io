# 主页面美术重制 · The Birch Forest

## 方向与实现

按用户选择的方向制作：电影级艺术空间；保留白桦林的主题，允许重画和重新配色；兼顾电脑视觉与手机完整体验。

- 夜景为深墨蓝、银白树干与远处的琥珀光；日景为同一构图的晨雾、象牙白与灰绿色。
- 首屏展示整幅森林和大尺度品牌字体，下面是日志、展览与留言的阅读版面。
- `.rail` 类名保留，实际已是顶部常驻导航。联系链接在页脚；`#stage` 与 `#overlay-root` 的职责不变。
- 首页以下的项目、工具、日志日历、网格画廊、下载和阅读弹层使用同一套字体、间距与颜色。
- 中文、英文、韩文保留；日志正文仍保留原有像素字体与缩进。
- `js/forest-scene.js` 是独立、无依赖的 WebGL2 增强层：只对源图下部池塘做细微折射，树干和岸边不动；雾区轻微明暗变化。
- WebGL 每秒最多绘制 30 帧，桌面 DPR 上限 1.5、手机 1，缓冲区最多 320 万像素；粒子也限制为约 30 帧。切换栏目、离开首屏、隐藏标签页或启用减少动态效果时暂停。
- 不能使用 WebGL、图片加载失败或上下文丢失时，显示独立的 CSS 背景。减少动态效果时画廊使用可手动滚动的静态预览。
- 保留浏览器 View Transitions 日夜切换，以及不支持该 API 时的过渡方案。[View Transition API 文档](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
- 动效遵循系统的减少动态效果偏好。[prefers-reduced-motion 文档](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion)

网站仍直接提供 HTML、CSS、JS，没有新增构建流程、包管理器或框架。原有博物馆、计算器、内容数据及留言提交配置没有在本次修改中调整。

## 素材

主视觉使用内置 **imagegen** 生成，未使用 CLI/API 回退。生成的两幅源图均为 1672 × 941，交付版本仅做 WebP 编码和等比缩小，没有修改构图或调色。

| 文件 | 尺寸 | 字节数 |
| --- | --- | ---: |
| `images/forest-night.webp` | 1672 × 941 | 305224 |
| `images/forest-day.webp` | 1672 × 941 | 363410 |
| `images/forest-night-mobile.webp` | 900 × 507 | 112374 |
| `images/forest-day-mobile.webp` | 900 × 507 | 139328 |

Cormorant Garamond 正体、斜体与 Manrope 可变字体已放入 `fonts/`，三份 Latin WOFF2 合计 71372 字节。CJK 使用系统字体，PatchFont 沿用原有文件。字体官方来源和 OFL 许可见 [字体记录](../../fonts/forest-redesign-fonts.md)。保留原来的两幅 JPG 背景文件，当前主页面不再引用它们。

## 原始生成提示词

夜景，生成新图：

```text
Use case: stylized-concept. Asset type: ultrawide cinematic website hero background for a personal art space called This is Eytle, no text. Create a breathtaking fine-art photographic film still of a real silver birch forest at blue hour at night. Extremely refined, immersive, believable woodland; cathedral-like tall slender ivory birch trunks, deep ink navy and petrol blue shadows, delicate atmospheric mist separating many layers, sparse leaves, a still black reflecting pool across lower third, scattered copper autumn foliage and dark moss. A single soft distant warm amber light source hidden deep between trees slightly right of center, spilling a restrained horizontal pool of warm reflected light. Asymmetric editorial composition: left 40 percent very dark quiet negative space for large typography, the most beautiful architectural birches and warm light on the right 60 percent. Top foliage dissolves into near-black, bottom ground near-black. Silvery bark has tactile fine detail. High dynamic range but subtle natural color grading, true cinematic chiaroscuro, medium-format photography, quiet mysterious sublime atmosphere, sophisticated luxury art direction. Broad 16:9 landscape, 2560x1440 or highest available resolution. No buildings, no people, no lettering, no logos, no watermarks, no interface, no fantasy portal rings, no neon, no over-saturated orange, no blue gradient wallpaper. Finished production artwork, not a UI mockup.
```

日景，以生成的夜景为编辑目标：

```text
Use case: lighting-weather. Asset type: DAY companion background for the same cinematic personal art website. Edit the supplied night birch forest artwork into a luminous misty dawn. Preserve exactly the composition, geometry, all tree positions, camera angle, pond and reflections. Change only time of day, illumination and natural colors: pale silver mist, luminous ivory birch bark, muted sage and olive moss, gentle soft champagne early sun in the same right-of-center distant position. Dawn atmosphere is exquisitely calm and painterly, natural medium-format fine-art photography, refined warm ivory and pale blue-green grading. Keep atmospheric separation and stunning depth. Left 40 percent of the scene has calm pale shadowy mist suitable for dark overlaid typography. Forest remains visible with subtle detailed bark and delicate fall copper leaves. No snow, no overexposure, no large white sun disk, no added objects, no buildings, no people, no text or UI. Same wide aspect ratio and high resolution as the reference.
```

提示词中的请求分辨率与工具实际输出不同；上方素材表记录实际交付尺寸。

## 验证

- `node --test tests/*.test.js`：37 项通过，0 项失败。
- `node --check js/main.js`、`node --check js/forest-scene.js`、`git diff --check` 通过。
- 新增实际执行的异步渲染回归检查：延迟返回的首页、日志、画廊加载不能覆盖用户后来进入的栏目或语言版本；当前日志仍正常完成加载。
- 在内置 Chromium 浏览器检查 1440 × 960、1024 × 768、390 × 844 和 320 × 740 视口；修复了 320px 窄屏导航超出页面 5px 的问题。
- 检查日夜视觉、三语切换和刷新后保留；桌面 WebGL 画布正常显示，无浏览器错误或警告。
- 检查项目展开及子链接、两个工具的链接与打开方式、五个下载地址、日志年→月→日→正文、关闭与 Esc、移动端画廊入口和 3072px 原图完成显影。
- 留言仅检查空值反馈和 140 字计数，未提交真实测试留言。
- 实测滚动到首页底部后水面和粒子画布都暂停；页脚品牌可返回首屏。
- 移动端检查使用浏览器视口模拟，尚未在实体手机逐台验证；降低动态效果和 WebGL 失败路径保留静态兜底。

本实现任务结束时只在本地预览。后续与展馆一起同步的内容和整合检查见 [同步记录](2026-09-12-sync.md)；正式部署遵循根目录 `CODEx_DEPLOY_GUIDE.md`。

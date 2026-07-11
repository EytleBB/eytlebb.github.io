# This is Eytle 子项目设计

## 目标

在 GitHub 账号 `EytleBB` 下创建两个公开独立仓库，并将它们作为网站项目页中 `This is Eytle` 的两个子项目展示。

## 仓库

- `Eytle-Museum`：初始化一个简短 README，说明它对应本站的 3D Gallery Museum。
- `Eytle-Patch-Log`：初始化一个简短 README，说明它对应本站的 Patch Log。

两个仓库仅作为项目入口，不迁移或复制现有网站代码。Museum、Patch Log 及其数据仍由当前 `eytlebb.github.io` 仓库维护和部署。

## 网站改动

在 `js/main.js` 的 `DATA.projects` 中，为 `This is Eytle` 添加上述两个子项目，分别链接到新 GitHub 仓库。沿用 CSAI 的展开列表与外部链接样式，不增加新页面或新交互。

## 验证

只做轻量检查：确认两个 GitHub 仓库可访问、`main.js` 语法有效、项目数据中的名称和 URL 正确。不运行与本次数据改动无关的完整测试。

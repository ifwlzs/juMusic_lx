# 发版版本规则迁移与播放页背景浏览器预览设计

日期：2026-04-08  
状态：已确认，待用户复核后进入实现规划

## 概述

本设计同时处理两项已经确认、且适合一起落地的工作：

1. 发版版本体系从当前的 `yymmddhh` 迁移到新的“显示版本 + 内部 versionCode”双轨方案。
2. 为播放页模糊背景提供一个长期保留的浏览器预览工具，方便后续像前端调样式一样快速试效果。

本次重点不是重做整个发版系统，也不是把播放页完整搬到 Web 端，而是先把“给人看的版本号”和“给 Android 用的内部版本号”解耦，并给播放页背景建立一个低成本、高反馈的长期调试工具。

## 目标

1. 让所有用户可见版本号统一为 `0.yy.MMddhhmm`。
2. 让 Android `versionCode` 不带分钟，但仍保持单调递增、可支持同小时重复发版、可支持 ABI 拆包。
3. 让 `package.json`、`publish/version.json`、`CHANGELOG.md`、Git tag、GitHub Release 名称、APK 文件名全部走同一套版本生成逻辑。
4. 让播放页背景拥有一个长期保留的浏览器预览工具，只服务模糊背景调试，不依赖 React Native 运行。

## 非目标

1. 不重做整个 CHANGELOG 历史。
2. 不回写历史已发布 tag 或历史 changelog 节标题。
3. 不把播放页完整做成 Storybook 或独立 Web 应用。
4. 不在本次预览工具中覆盖标题、按钮、歌词布局或播放交互。

## 方案选择

### 方案 A：显示版本和 versionCode 都继续做人类可读日期串

做法：

1. 显示版本改成 `0.yy.MMddhhmm`。
2. `versionCode` 改成 `yyMMddHH`。

优点：

1. 规则直观。
2. 肉眼容易理解。

缺点：

1. 同一小时内重复发版会撞 `versionCode`。
2. 现有 ABI 拆包逻辑容易继续放大数值并逼近 Android 上限。

### 方案 B：显示版本人类可读，versionCode 改为小时级递增内部码

做法：

1. 显示版本统一使用 `0.yy.MMddhhmm`。
2. `versionCode` 改为单独的内部递增码，只保留到小时，并预留同小时重复发版与 ABI 槽位。

优点：

1. 用户可见版本号完全符合需求。
2. `versionCode` 可稳定满足 Android 限制。
3. 同小时多次发版、分 ABI 打包都能稳定处理。

缺点：

1. `versionCode` 不再直接给人看懂。

### 方案 C：单独再起一套大型预览子工程

做法：

1. 发版版本规则按方案 B 处理。
2. 播放页背景预览单独起一个 Vite 或类似 Web 工程。

优点：

1. 扩展性最强。

缺点：

1. 只为背景调试时过重。
2. 长期维护成本不必要地上升。

### 结论

采用 **方案 B**。

原因：

1. 用户可见版本号和 Android 内部版本号本质上服务不同对象，应明确拆分。
2. 当前仓库已经有本地打包、GitHub Actions、CHANGELOG、Release 自动化链路，版本生成必须继续保持单一来源。
3. 播放页背景预览当前只需要长期、轻量、快反馈的工具，不需要独立大型前端工程。

## 一、版本规则设计

### 1. 双轨版本语义

本次把版本拆成两个字段：

1. `displayVersion`
2. `versionCode`

其中：

1. `displayVersion` 仅用于用户可见场景。
2. `versionCode` 仅用于 Android 安装升级判断及 split APK 内部版本区分。

### 2. displayVersion 规则

显示版本统一采用：

1. `0.yy.MMddhhmm`

示例：

1. `0.26.04081132`

适用范围：

1. `package.json.version`
2. `publish/version.json.version`
3. `CHANGELOG.md` 最新节标题
4. Git tag
5. GitHub Release 名称
6. APK 文件名

### 3. displayVersion 冲突处理

若同一分钟内需要重复发版，则对显示版本追加最小后缀：

1. `0.26.04081132.1`
2. `0.26.04081132.2`

规则要求：

1. 平时默认仍然是纯 `0.yy.MMddhhmm`。
2. 只有分钟级冲突时才补后缀。
3. 后缀只参与显示版本、Git tag、Release 名称、APK 文件名，不进入 Android `versionCode` 基础时间部分。

### 4. versionCode 规则

`versionCode` 采用小时级基准码 + 小时内序号 + ABI 槽位的组合方案。

定义：

1. `hourCode = yyMMddHH`
2. `hourlySerial = 0..9`
3. `abiSlot = 0..4`

其中：

1. `abiSlot = 0` 表示 universal。
2. `abiSlot = 1..4` 对应当前 4 个 ABI 包。

组合公式：

1. `baseVersionCode = hourCode * 50 + hourlySerial * 5`
2. `finalVersionCode = baseVersionCode + abiSlot`

这样可以保证：

1. 同一小时内最多支持 10 次发版。
2. 同一轮发版的 universal 与分 ABI 安装包拥有不同的内部版本号。
3. 整体数值仍在 Android `int` 范围内。

### 5. 同小时发版处理

当同一小时内存在多次发版时：

1. `displayVersion` 继续按真实分钟生成；若分钟也冲突，再追加 `.1`、`.2`。
2. `hourlySerial` 根据该小时内已有版本数量顺延。
3. `versionCode` 仅通过 `hourlySerial` 区分，不引入分钟。

这意味着：

1. 同小时不同分钟发版，`versionCode` 也会继续递增。
2. `displayVersion` 和 `versionCode` 不需要强行编码为同一串文本。

## 二、发版链路改造

### 1. 单一版本入口

继续使用 `scripts/release/versioning.js` 作为唯一版本生成模块，但拆成以下职责：

1. `formatDisplayVersion(date)`
2. `selectDisplayVersion(existingVersions, date)`
3. `selectHourlySerial(existingVersions, date)`
4. `buildVersionCode(date, hourlySerial)`
5. `selectReleaseVersion(...)`

其中 `selectReleaseVersion(...)` 应返回结构化结果，而不是单一字符串，至少包括：

1. `displayVersion`
2. `versionCode`
3. `hourlySerial`

### 2. 元数据写回

版本准备阶段统一写回：

1. `package.json.version = displayVersion`
2. `package.json.versionCode = baseVersionCode`
3. `publish/version.json.version = displayVersion`
4. `CHANGELOG.md` 最新节标题版本号 = `displayVersion`

### 3. Android 构建逻辑

当前 `build.gradle` 中，分 ABI 的 `versionCodeOverride` 使用的是大步长放大逻辑。迁移后改为：

1. universal：直接使用 `defaultConfig.versionCode`
2. 分 ABI：使用 `defaultConfig.versionCode + abiSlot`

这样可以避免：

1. 再乘以 1000 导致数值过大。
2. 与新的内部版本码规则重复叠加。

### 4. GitHub Release 与本地打包

以下位置都改为使用 `displayVersion`：

1. Git tag
2. GitHub Release 名称
3. Release 产物路径
4. APK 文件名
5. 本地 PowerShell 打包脚本输出说明

预期示例：

1. tag：`v0.26.04081132`
2. Release 名称：`JuMusic 安卓版 v0.26.04081132`
3. APK：`lx-music-mobile-v0.26.04081132-universal.apk`

## 三、仓库头部迁移策略

### 1. 迁移范围

本次迁移不仅影响未来发版规则，也会把当前仓库头部状态一起改成新规则：

1. `package.json`
2. `publish/version.json`
3. `CHANGELOG.md` 最新节

### 2. 历史数据处理

不回写以下历史内容：

1. 已发布 Git tag
2. 历史 GitHub Release
3. `CHANGELOG.md` 中旧节标题

理由：

1. 历史版本已经对外发布，回写成本高且风险大。
2. 用户需求是“当前头部也一起迁”，不是“重写所有历史版本”。

## 四、播放页背景浏览器预览工具

### 1. 目标

提供一个长期保留的浏览器预览工具，用来专门调试播放页背景模糊层。该工具要满足：

1. 可以直接改代码看效果。
2. 可以拖入真实封面图。
3. 不依赖 React Native 或 App 运行。
4. 长期保留在仓库中，供后续持续使用。

### 2. 工具目录

建议新增目录：

1. `tools/play-detail-bg-preview/`

目录内容保持轻量：

1. `index.html`
2. `styles.css`
3. `preview.js`
4. `README.md`

### 3. 预览范围

本次预览页只覆盖播放页背景，不覆盖：

1. 标题文本
2. 按钮
3. 歌词布局
4. 播放交互

页面中可保留一个最小“安全区”轮廓，仅用于辅助观察背景层级与中心可读区范围。

### 4. 预览能力

至少支持：

1. 默认测试图切换
2. 用户拖拽真实封面图替换背景
3. 原图 / 拉伸 / 模糊 / 灰色遮罩 / 边缘渐变圈层等背景策略开关或组合
4. 直接改 `styles.css`、`index.html` 后浏览器立即刷新

### 5. 参数映射

浏览器预览页与 React Native 播放页背景之间不要求共享运行时代码，但要求共享参数语义。

至少要把这些参数在 README 里做一一映射：

1. `blurRadius`
2. `scaleX`
3. `scaleY`
4. `baseOverlayOpacity`
5. `edgeOverlayColor`
6. `edgeOverlayWidth`

映射目标文件：

1. `src/components/PageContent.tsx`

### 6. 工具价值

该工具的定位不是一次性调试页，而是长期保留的视觉调试工具。后续只要播放页背景策略变化，优先在这个工具里调，再把确认过的值映射回 React Native 实现。

## 五、验证策略

### 1. 版本规则验证

至少验证：

1. `displayVersion` 输出符合 `0.yy.MMddhhmm`。
2. 同分钟重复发版会追加 `.1`、`.2` 后缀。
3. 同小时不同分钟发版时，`versionCode` 仍继续递增。
4. `versionCode` 不超过 Android `int` 上限。
5. `CHANGELOG.md`、`publish/version.json`、`package.json`、GitHub Release 相关路径都跟新格式一致。

### 2. Android 构建验证

至少验证：

1. `build.gradle` 中 universal 和分 ABI 的 `versionCode` 规则符合新设计。
2. release / debug 打包后的 APK 文件名使用 `displayVersion`。
3. 分 ABI 安装包拥有不同内部版本号。

### 3. 预览工具验证

至少验证：

1. 打开浏览器工具页时，无需启动 App 即可查看默认背景。
2. 拖拽图片后背景立即替换。
3. 修改 `styles.css` 后能立即观察到模糊背景变化。
4. README 中能查到浏览器参数到 `PageContent.tsx` 的对应关系。

## 自检

### 占位检查

1. 无 `TODO`、`TBD`、`以后再说` 等占位语。
2. 版本规则、冲突规则、versionCode 公式、预览工具范围都已明确。

### 一致性检查

1. 显示版本带分钟、`versionCode` 不带分钟的要求已拆开实现。
2. Git tag、Release 名称、APK 文件名统一跟 `displayVersion` 走。
3. 预览工具范围与“暂时只改模糊背景”的需求一致。

### 范围检查

1. 本次不重写历史发版记录。
2. 本次不做完整播放页 Web 化。
3. 本次预览工具只服务背景层调试。

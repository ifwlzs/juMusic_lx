# 播放页背景效果设置页设计

**日期：** 2026-04-09  
**范围：** `设置 -> 主题设置` 新增“播放页背景效果”入口；只影响播放详情页背景层  
**状态：** 已与用户确认

## 目标

把当前基于封面图生成播放页背景的那套效果参数，从临时浏览器预览工具迁移为正式 App 设置能力。用户可以在正式设置页中打开一个专用调参界面，基于当前播放歌曲的封面实时预览并调整背景效果。调整项只覆盖播放页背景渲染参数，不开放前景高亮色、歌词色、按钮强调色等前景配色修改。

## 已确认决策

1. 入口放在正式 App 的“主题设置”中。
2. 参数全量开放，不做“常用/高级”分层裁剪。
3. 这套参数只作用于播放详情页背景，不扩展到其他页面。
4. 设置页顶部提供实时预览区。
5. 预览默认使用“当前正在播放的歌曲封面”。
6. 用户改完以后，播放页背景整套效果按用户参数渲染。
7. 高亮色、歌词色、按钮强调色等前景配色继续由系统自动策略决定，不放进这个设置页。

## 非目标

以下内容不在本次设计范围内：

- 不改播放页前景颜色系统（包括主文字色、歌词高亮色、按钮强调色、进度条前景色）。
- 不把这套背景设置扩展成全局动态背景设置。
- 不新增独立导航页面；本次优先沿用现有设置页中“入口 + Dialog”的模式。
- 不在本次设计中引入复杂颜色拾取器；颜色输入先用文本输入和快捷动作完成。

## 用户入口与界面骨架

### 入口位置

在 `设置 -> 主题设置` 中新增一个 section：

- 标题：`播放页背景效果`
- 位置建议：`动态背景` 之后、`字体阴影` 与 `播放页文字颜色自定义` 之前

推荐顺序：

1. 主题选择
2. 跟随系统主题
3. 隐藏黑色背景
4. 动态背景
5. 播放页背景效果
6. 字体阴影
7. 播放页文字颜色自定义

### 入口内容

入口 section 不直接摊开全部参数，只显示轻量摘要：

- 说明文案：`使用当前歌曲封面生成播放页背景，可调节模糊、蒙版和四周压暗效果`
- 状态摘要：当前蒙版模式、模糊值、蒙版透明度、是否偏离默认值
- 操作按钮：`打开调节`

当 `theme.dynamicBg` 为 `false` 时，额外显示弱提示：

- `当前未开启动态背景，参数已可预设，开启后会作用到播放页`

## 调参界面

入口按钮点击后打开一个大号 Dialog，整体结构分为三块：

### 1. 顶部操作栏

包含：

- 标题：`播放页背景效果`
- 按钮：`恢复默认`
- 按钮：`关闭`

### 2. 实时预览区

预览区固定在 Dialog 顶部，使用当前正在播放歌曲的封面作为底图来源。

预览内容包括：

- 拉伸后的封面底图
- 强模糊处理
- `color-mask` 蒙版
- `vignette` 四周压暗
- 一个简化的前景占位层（封面块、标题行、按钮占位），仅用于帮助判断背景是否影响可读性

预览区必须复用正式播放页的背景渲染逻辑，而不是单独再写一套“近似预览”。

### 3. 可滚动参数区

参数区使用现有设置控件（`Slider`、`InputItem`、按钮）组织，并按四组展示：

1. 底图基础
2. 蒙版颜色
3. 自动取色策略
4. 四周压暗

## 参数边界

### 负责的内容

设置页控制的内容仅限播放页背景层：

1. 底图拉伸
2. 底图模糊
3. 底图亮度 / 对比度
4. `color-mask` 蒙版颜色和透明度
5. 自动取主色偏灰策略
6. `vignette` 四周压暗

### 不负责的内容

以下内容仍由现有系统自动策略处理，不进入这个设置页：

- 播放页主文字颜色
- 歌词高亮色 / 未播放色 / 翻译色 / 罗马音色
- 按钮强调色
- 进度条前景色
- 其他前景 UI 元素颜色

## 参数分组与控件形式

### A. 底图基础

参数：

- `stretchScale`
- `blurRadius`
- `imageBrightness`
- `imageContrast`

控件形式：全部使用 `Slider`。

### B. 蒙版颜色

参数：

- `maskMode`
- `maskColor`
- `colorMaskOpacity`

控件形式：

- `maskMode`：二选一切换（`自动取色` / `手动颜色`）
- `maskColor`：文本输入 + 当前颜色小色块预览
- `colorMaskOpacity`：`Slider`

颜色输入第一版只要求支持 `#RRGGBB`。

### C. 自动取色策略

参数：

- `maskSaturation`
- `maskLightness`

控件形式：

- 两个参数均使用 `Slider`
- 显示当前封面推导出的推荐蒙版色（含色块和文本）
- 提供动作按钮：`套用当前推荐色`

### D. 四周压暗

参数：

- `vignetteColor`
- `vignetteSize`

控件形式：

- `vignetteSize`：`Slider`
- `vignetteColor`：文本输入 + 当前颜色小色块预览

## Setting 模型

建议新增以下 setting key，并挂在 `theme.playDetail.background.*` 命名空间下：

- `theme.playDetail.background.stretchScale: number`
- `theme.playDetail.background.blurRadius: number`
- `theme.playDetail.background.imageBrightness: number`
- `theme.playDetail.background.imageContrast: number`
- `theme.playDetail.background.maskMode: 'auto' | 'manual'`
- `theme.playDetail.background.maskColor: string`
- `theme.playDetail.background.colorMaskOpacity: number`
- `theme.playDetail.background.maskSaturation: number`
- `theme.playDetail.background.maskLightness: number`
- `theme.playDetail.background.vignetteColor: string`
- `theme.playDetail.background.vignetteSize: number`

### 默认值

默认值直接沿用用户已认可的浏览器调参模板：

- `stretchScale: 1`
- `blurRadius: 200`
- `imageBrightness: 1`
- `imageContrast: 1.5`
- `maskMode: 'auto'`
- `maskColor: '#914c4c'`
- `colorMaskOpacity: 0.37`
- `maskSaturation: 0.312`
- `maskLightness: 0.433`
- `vignetteColor: '#898685'`
- `vignetteSize: 250`

## 自动取色逻辑

自动蒙版色统一使用当前已经验证通过的逻辑：

1. 从当前封面图中提取主色相（dominant hue）
2. 色相按 `15°` 进行吸附（snap）
3. 使用 `maskSaturation` 和 `maskLightness` 生成偏灰 HSL 颜色
4. 输出最终蒙版色，供预览和正式播放页共用

### `maskMode` 语义

- `auto`：每次当前歌曲封面变化时，重新基于封面生成推荐蒙版色，并直接用于背景渲染
- `manual`：停止跟随封面自动取色，始终使用用户显式指定的 `maskColor`

### 推荐色展示与套用

Dialog 中始终展示当前封面计算出的推荐蒙版色。用户可点击“套用当前推荐色”按钮，将该颜色写入 `maskColor`，并自动切换到 `manual` 模式，以便把当前自动结果固定下来。

## 正式播放页的运行时优先级

播放页背景配置按以下顺序确定：

1. 使用内置默认模板作为起点
2. 用 `theme.playDetail.background.*` 用户设置覆盖默认值
3. 根据 `maskMode` 和当前封面，解析出本次实际使用的 `resolvedMaskColor`
4. 将解析后的背景配置交给共享渲染层绘制

这意味着当前的 `playDetailEmby` 不再是“纯固定 preset”，而是“播放页背景模板的运行时入口”。`PlayDetail/index.tsx` 仍然可以保留 `backgroundVariant="playDetailEmby"` 的写法，但其内部实现应改为读取 setting 覆盖结果。

## 与现有功能的共存关系

### 与 `theme.dynamicBg` 的关系

- 当 `theme.dynamicBg = false`：
  - 设置页仍可打开并调参
  - 顶部预览照常工作
  - 正式播放页不启用封面动态背景
  - 页面提示“当前未开启动态背景，开启后生效”

- 当 `theme.dynamicBg = true`：
  - 播放页正式使用当前封面背景
  - 所有 `theme.playDetail.background.*` 参数全部生效

### 与 `CustomColors` 的关系

`CustomColors` 继续只负责播放页前景配色组；本次新增的背景设置只负责背景层。两者并行存在，互不覆盖。

### 与 `playDetailEmby` 的关系

本次不急于改名。继续保留 `playDetailEmby` 这个 background variant 名称，但其内部逻辑由“固定 preset”升级为“默认模板 + 用户 setting 覆盖”的运行时配置。

## 共享逻辑拆分

为避免“设置页预览效果”和“正式播放页效果”不一致，建议抽成两层共享能力：

### 1. 配置解析层

负责：

- 提供默认背景参数
- 读取并归一化 setting 值
- 根据 `maskMode` 决定自动 / 手动蒙版色
- 在自动模式下基于当前封面生成 `resolvedMaskColor`
- 产出正式可渲染的背景配置对象

### 2. 背景渲染层

负责：

- 渲染拉伸后的背景图
- 应用 blur
- 叠加 `color-mask`
- 叠加 `vignette`

这个渲染层同时被：

- 正式播放页背景
- 设置页顶部实时预览

共同使用。

## 保存与预览策略

### 预览刷新

设置页内部使用本地 draft 状态来驱动实时预览，参数变化后立即刷新预览。

### Setting 持久化

- 滑杆类参数：使用轻量节流写入或拖动结束后写入
- 文本输入类参数：在确认或失焦时写入
- `恢复默认`：立即把 draft 和 setting 一起重置回默认模板

这样既保证调参手感是“实时”的，又避免在滑杆拖动过程中对全局 setting 进行高频持久化。

## 空态与回退规则

### 无可用封面

当当前没有播放歌曲或没有可用封面时：

- 预览区显示占位预览
- 自动取色按钮禁用
- 手动颜色输入和其余参数照常可调

### 自动取色失败

回退顺序：

1. 若 `maskMode = manual`，直接使用 `maskColor`
2. 若 `maskMode = auto` 且本次取色失败：优先使用上一次成功的自动色
3. 若没有上一次成功值，则回退到默认 `maskColor`
4. 最终兜底为 `#914c4c`

### 非法颜色输入

- 文本输入框保留用户原始输入
- 不污染正式有效值
- 显示轻量提示：`颜色格式无效，请输入 #RRGGBB`
- 预览继续使用上一个有效颜色

## 测试要求

至少覆盖以下几类测试：

1. **setting 模型测试**
   - 新增 key 存在于 `src/types/app_setting.d.ts`
   - 默认值存在于 `src/config/defaultSetting.ts`

2. **背景配置解析测试**
   - `auto` 模式如何生成 `resolvedMaskColor`
   - `manual` 模式如何固定使用 `maskColor`
   - 自动取色失败时的回退策略

3. **设置页结构测试**
   - `主题设置` 中出现新入口
   - Dialog 中出现预览区与全量背景参数控件
   - 不出现前景高亮色相关配置入口

4. **播放页集成测试**
   - 播放页背景读取 setting 化后的运行时配置
   - 正式背景与预览复用同一套背景渲染逻辑

## 实施顺序建议

1. 扩展 setting 类型和默认值
2. 抽取共享背景配置解析层
3. 抽取共享背景渲染层
4. 在主题设置中增加入口与 Dialog
5. 将播放页正式接入新的 setting 化背景配置
6. 补充聚焦测试与回归验证

## 成果定义

最终用户可以在“设置 -> 主题设置 -> 播放页背景效果”中：

- 查看当前歌曲封面的背景预览
- 调整背景模糊、亮度、对比度、蒙版与四周压暗
- 在自动取色与手动蒙版色之间切换
- 让播放页背景完整按用户参数渲染
- 同时保持前景高亮色、歌词色、按钮色继续由系统自动策略控制

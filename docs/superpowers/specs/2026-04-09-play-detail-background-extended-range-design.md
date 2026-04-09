# 播放页背景扩展调参范围与独立压暗强度设计

日期：2026-04-09  
状态：已确认，待用户审阅

## 概述

当前播放页背景已经具备：

1. 强制拉伸的封面底图；
2. 多层模糊；
3. 灰偏 color mask；
4. 四周连续渐变压边。

但在正式 App 里，用户仍然明显感知到两个问题：

1. 把模糊度拉到最大后，效果仍然不够“糊”；
2. 把四周压边范围拉大后，边缘压色仍然不够明显。

根因不是“设置项完全没生效”，而是当前实现存在两个结构性限制：

1. 部分参数在运行时提前封顶，UI 还能继续拉，但视觉已经基本不再增强；
2. 四周压边目前只有“范围”参数，没有独立“强度”参数，导致用户很难直接把边缘压得更重。

本设计保持**默认值不变**，只做两类调整：

1. 放大现有设置项的**真实生效范围**；
2. 新增一个独立的 `vignetteStrength` 设置项，把“压边范围”和“压边强度”拆开。

## 目标

1. 保持当前默认视觉不变。
2. 允许用户把背景调得比现在明显更模糊。
3. 允许用户把四周压边调得明显更重，而不仅仅是更宽。
4. 修复当前“UI 范围还能拉，但运行时已经提前封顶”的问题。
5. 保持设置页结构简单，不引入“高级模式”。

## 非目标

1. 不改变默认播放页背景的基础审美方向。
2. 不增加新的前景高亮、歌词色、按钮强调色设置项。
3. 不把背景改成 shader、GPU blur 或其他新的渲染架构。
4. 不重新设计背景预览页结构。

## 当前问题

### 1. blurRadius 的 UI 范围大于真实生效范围

当前 `blurRadius` 在设置页可以继续上拉，但运行时最终会被映射为三层 blur 半径。高对比场景下，三层实际 blur 很快就会接近上限，因此：

1. 用户继续拉高 `blurRadius`；
2. 但三层 blur 半径几乎不再继续增大；
3. 视觉上就像“最大了还是不够糊”。

### 2. stretchScale 在 1.2 以上提前封顶

当前设置页允许把 `stretchScale` 拉到更高，但运行时内部仍把基础缩放限制在较低上限，导致：

1. UI 还能继续拖；
2. 实际底图放大不再继续生效。

### 3. vignetteSize 目前只控制范围，不控制强度

当前四周压边只有：

1. `vignetteColor`
2. `vignetteSize`

其中：

1. `vignetteSize` 更接近“压边往内延伸多远”；
2. 真正的压暗强度来自内部计算的 overlay opacity；
3. 这个 opacity 目前没有独立设置项，且上限偏轻。

结果就是：

1. 边缘范围可以变宽；
2. 但用户仍然觉得“没有明显压下去”。

## 设计原则

1. **默认值不动**：不影响现在已经接受当前默认视觉的用户。
2. **范围和强度拆开**：`vignetteSize` 只管范围，`vignetteStrength` 只管强度。
3. **UI 范围必须和运行时真实生效范围一致**：不再允许“滑杆可调，但内部已封顶”的假象。
4. **更激进但可控**：提供更大的可调空间，但仍保留合理下限和上限。

## 设置项调整

## 1. 新增设置项

新增：

1. `theme.playDetail.background.vignetteStrength`

含义：

1. 四周压边的强度；
2. 直接控制 vignette overlay 的不透明度；
3. 不再由 `imageContrast` 间接决定。

### 默认值

默认值保持与当前默认视觉接近，建议：

1. `vignetteStrength = 0.25`

这会与当前默认 `imageContrast = 1.5` 下的实际压边强度基本一致，保证默认观感不突变。

## 2. 现有设置项的新范围

建议调整为：

1. `stretchScale`: `1.00 ~ 1.60`
2. `blurRadius`: `60 ~ 560`
3. `imageBrightness`: `0.35 ~ 1.85`
4. `imageContrast`: `0.70 ~ 3.20`
5. `colorMaskOpacity`: `0.05 ~ 0.95`
6. `maskSaturation`: `0.03 ~ 0.72`
7. `maskLightness`: `0.12 ~ 0.82`
8. `vignetteSize`: `60 ~ 680`
9. `vignetteStrength`: `0.08 ~ 0.78`

这些范围的目标是：

1. 用户能把背景调得明显更极端；
2. 但默认值仍然落在原来的视觉区间里。

## 运行时映射调整

## 1. blur 强度映射

需要同时调整 `backgroundConfig.ts` 中的 blur 映射曲线，保证：

1. 默认值 `blurRadius = 200` 时，三层 blur 仍接近当前默认效果；
2. 高端区间继续上拉时，三层 blur 半径能明显增长，而不是提前饱和。

实现目标：

1. 默认值附近输出与当前实现接近；
2. 高端区间显著高于当前 `24 / 36 / 48` 的内部上限；
3. 用户在高值区间继续拖动时，视觉仍能继续变强。

## 2. stretchScale 映射

运行时内部 `clamp` 需要放开，与设置页上限一致，至少保证：

1. 设置页拖到的最大值在运行时仍然有效；
2. 不再出现 `1.2` 以上被静默截掉的情况。

## 3. vignette 强度映射

`vignetteStrength` 直接参与 vignette overlay 颜色计算：

1. `vignetteOverlayColor = buildRgba(vignetteColor, vignetteStrength)`
2. `vignetteTransparentColor = buildRgba(vignetteColor, 0)`

不再让 `imageContrast` 隐式控制 vignette 强度。  
`imageContrast` 只负责图像本身的对比度表现与 blur 层次，不再影响边缘压暗强弱。

## 4. vignetteSize 仍只控制深度

`vignetteSize` 继续只控制：

1. 顶 / 底 / 左 / 右四条渐变边层的深度；
2. 即压边从边缘往内延伸多远。

这样用户调参时会更直观：

1. 想让压边更宽：调 `vignetteSize`
2. 想让压边更重：调 `vignetteStrength`

## 设置页改动

## 1. Slider 布局

在 `四周压暗` 分组里，保留：

1. `vignetteColor`
2. `vignetteSize`

并新增：

3. `vignetteStrength`

推荐顺序：

1. `vignetteColor`
2. `vignetteSize`
3. `vignetteStrength`

这样用户先决定颜色，再决定范围，再决定压暗强度。

## 2. 恢复默认

恢复默认时，需要把：

1. 新增的 `vignetteStrength`

也一起重置到默认值 `0.25`，保证“恢复默认”仍然是完整回滚。

## 3. 预览区行为

预览区不需要新增特殊交互，只需要：

1. 随 slider 即时更新；
2. 让用户能直接看到“更糊”和“更压”的效果差异。

## 数据与兼容性

## 1. AppSetting

需要在设置类型和默认设置中补上：

1. `theme.playDetail.background.vignetteStrength`

## 2. 老用户兼容

老用户没有该字段时：

1. 使用默认值 `0.25`

这能保证升级后视觉不突变。

## 验收标准

1. 不改任何设置时，播放页默认效果与当前主线保持一致。
2. 用户把 `blurRadius` 拉高后，背景能比当前实现明显更模糊。
3. 用户把 `stretchScale` 拉到高值时，底图放大仍继续生效。
4. 用户把 `vignetteSize` 拉高时，压边范围明显变宽。
5. 用户把 `vignetteStrength` 拉高时，四周压边明显变重。
6. `vignetteSize` 和 `vignetteStrength` 可以独立调节，不再互相混淆。
7. 恢复默认会完整回滚所有背景设置，包括新增的 `vignetteStrength`。

## 自动化测试重点

1. `AppSetting` 类型声明和默认设置包含 `vignetteStrength`。
2. 背景设置对话框暴露 `vignetteStrength` 控件。
3. `resolvePlayDetailBackgroundConfig()` 输出：
   1. `vignetteOverlayColor`
   2. `vignetteTransparentColor`
   且其 alpha 由 `vignetteStrength` 直接决定。
4. `resolveNativeBlurLayers()` 在默认值附近保持现有视觉基线，在高值区间明显高于当前上限。
5. 设置页 slider 范围与运行时内部 clamp 一致，不再出现 UI 范围大于真实生效范围的情况。


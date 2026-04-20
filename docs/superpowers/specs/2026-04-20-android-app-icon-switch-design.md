# Android 应用图标双方案切换设计（默认 icon1）

日期：2026-04-20  
状态：已确认，待用户审阅

## 概述

本设计为 juMusic Android 端提供“应用内切换桌面图标”的能力。用户在设置页可在 `icon1` 与 `icon2` 间切换，默认使用 `icon1`，切换结果在应用重启后保持。

本次范围仅限 Android，iOS 不在本次实现范围。

## 目标

1. Android 首次安装默认显示 `icon1`。
2. 应用内提供图标切换开关（`icon1` / `icon2`）。
3. 切换后桌面图标可生效（允许机型级短暂刷新延迟）。
4. 重启应用后保持用户上次选择的图标。
5. 图标切换逻辑可维护、可扩展，避免后续新增图标时重构核心流程。

## 非目标

1. 不实现 iOS Alternate Icons。
2. 不实现远程下发图标或在线图标包。
3. 不在本次实现中新增第三个及以上图标方案。
4. 不修改现有发布流水线结构（仅做必要资源与配置接入）。

## 输入资产与约束

用户提供图标资产路径：

- `tests/icon/icon1.png`
- `tests/icon/icon1.svg`
- `tests/icon/icon2.png`
- `tests/icon/icon2.svg`

约束：

1. 允许素材尺寸不同；
2. 运行时实际使用 Android launcher 资源（mipmap / adaptive icon 配置）；
3. 默认 icon1；
4. 仅 Android。

## 方案选型

采用 Android 官方推荐路径：`activity-alias` 多 launcher 入口 + `PackageManager#setComponentEnabledSetting` 动态启停。

### 选型理由

1. 兼容性和可维护性优于非标准方案；
2. 支持运行时切换；
3. 切换状态由组件启用状态持久化，天然支持重启后保持；
4. 与 React Native 项目集成成本可控。

## 架构设计

### 1. Android 侧 launcher 入口设计

保持 `MainActivity` 作为真实 Activity，新增两个 `activity-alias`：

1. `MainActivityIcon1`
   - `enabled=true`
   - icon 指向 `ic_launcher`
   - roundIcon 指向 `ic_launcher_round`
   - 包含 `MAIN + LAUNCHER` intent-filter
2. `MainActivityIcon2`
   - `enabled=false`
   - icon 指向 `ic_launcher_alt`
   - roundIcon 指向 `ic_launcher_alt_round`
   - 包含 `MAIN + LAUNCHER` intent-filter

运行时保证同一时刻只启用一个 alias。

### 2. 图标资源设计

- 现有 `ic_launcher*` 资源作为 icon1（默认）
- 新增 icon2 对应资源：
  - `mipmap-mdpi/ic_launcher_alt.png`
  - `mipmap-hdpi/ic_launcher_alt.png`
  - `mipmap-xhdpi/ic_launcher_alt.png`
  - `mipmap-xxhdpi/ic_launcher_alt.png`
  - `mipmap-xxxhdpi/ic_launcher_alt.png`
  - 对应 `ic_launcher_alt_round.png`
- Android 8+ 自适应图标：
  - `mipmap-anydpi-v26/ic_launcher_alt.xml`
  - 引用 icon2 对应前景/背景资源

说明：SVG 作为设计源文件保留，不直接作为 launcher 最终运行资源。

### 3. React Native 原生桥接设计

新增 Android Native Module（例如 `AppIconModule`）：

1. `setIcon(iconName: 'icon1' | 'icon2')`
2. `getCurrentIcon(): 'icon1' | 'icon2'`

`setIcon` 核心流程：

1. 构造两个 alias 的 `ComponentName`；
2. 根据目标图标启用目标 alias、禁用另一个 alias；
3. 使用 `DONT_KILL_APP`；
4. Promise 返回成功/失败。

### 4. JS 服务与设置页设计

新增 JS 封装层（如 `src/utils/appIcon.ts`）：

1. `getCurrentAppIcon()`
2. `setCurrentAppIcon(iconName)`

设置页新增“应用图标”选项：

- `icon1（默认）`
- `icon2`

页面行为：

1. 初始化读取 `getCurrentAppIcon()`；
2. 用户切换时调用 `setCurrentAppIcon`；
3. 成功后更新 UI；
4. 可展示提示：部分机型桌面图标刷新存在短暂延迟。

## 持久化与一致性策略

### 1. 主状态来源

主状态以系统 alias 启用状态为准（Android 组件状态会持久化）。

### 2. 辅助本地状态

可选写入本地键（如 `selected_icon`）用于设置页快速展示。

一致性规则：

1. 若本地状态与系统 alias 状态冲突，以系统状态为准；
2. 发现冲突时回写本地状态。

## 错误处理

1. 切换失败：保持当前图标不变；
2. UI 给出失败反馈；
3. 不写入错误本地状态；
4. 日志不输出敏感信息；
5. 若检测到双 alias 同时启用，执行一次自修复（按当前目标图标只保留一个 enabled）。

## 验收标准

1. 首装默认 icon1；
2. 设置页可切换 icon1/icon2；
3. 切换后桌面图标可正确变更；
4. 重启应用后保持上次图标；
5. 连续切换不出现双图标常驻；
6. 切换失败有可见反馈；
7. Android 8+ adaptive icon 显示正常。

## 测试策略

### 手动验证（主）

1. 冷启动后检查默认 icon1；
2. 切换到 icon2，回桌面验证；
3. 杀进程重启验证保持；
4. 连续切换 10 次验证稳定性；
5. 在至少一台 Android 8+ 设备验证 adaptive icon。

### 自动化验证（辅）

对 JS 封装层补充单测：

1. 参数校验；
2. 状态同步（native 优先）逻辑；
3. 切换错误分支处理。

## 影响范围

预计修改路径：

1. `android/app/src/main/AndroidManifest.xml`
2. `android/app/src/main/res/mipmap-*/` 与 `mipmap-anydpi-v26/`
3. `android/app/src/main/java/.../AppIconModule.*`
4. `src/utils/appIcon.*`
5. 设置页相关文件（按当前项目结构定位）

## 后续扩展

1. 未来若新增 icon3，可沿用 alias + JS 枚举扩展；
2. iOS 如后续纳入，可并行引入 Alternate Icons，前端层保持统一接口。

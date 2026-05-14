# 媒体库歌曲详情弹窗设计规范

日期：2026-05-15  
状态：已确认（待按此规格进入实现计划）

## 1. 目标与范围

本规范用于指导 juMusic 在「我的列表」场景下补齐媒体库歌曲详情能力，优先解决以下问题：

1. WebDAV / SMB / OneDrive / 媒体库本地歌曲点击「歌曲详情页」没有可用反馈；
2. 用户无法直接查看媒体库歌曲的来源、路径、连接与状态信息；
3. 用户想复制歌曲名、路径或完整信息时，现有菜单语义与行为不一致。

本版目标是提供一个**应用内只读歌曲详情弹窗**，覆盖媒体库歌曲与本地文件歌曲的详情查看与复制能力。

本版不包含：

- 独立的全屏歌曲详情页面；
- 在线音源歌曲详情链路重构；
- 现有「分享歌曲」菜单项语义重命名或全局改造；
- 搜索页 `LibraryMusicList` 的交互升级。

---

## 2. 当前问题与根因

### 2.1 当前现象

在「我的列表」中：

1. 普通在线音源歌曲点击「歌曲详情页」会尝试跳转外部详情链接；
2. WebDAV / SMB / OneDrive / 媒体库歌曲点击同一入口时，没有可见反馈；
3. 用户期望的「复制歌曲名」能力，当前实际接入的是分享逻辑，行为受 `common.shareType` 配置影响。

### 2.2 根因

#### 根因 A：媒体库歌曲复用了在线音源详情实现

`src/screens/Home/Views/Mylist/MusicList/listAction.ts` 中的 `handleShowMusicSourceDetail()` 当前仍通过 `musicSdk[minfo.source]?.getMusicDetailPageUrl(...)` 获取详情链接。

该实现只适用于在线音源歌曲，不适用于：

- `local`
- `webdav`
- `smb`
- `onedrive`

因此媒体库歌曲点击「歌曲详情页」时没有可用的详情 URL，最终表现为无响应。

#### 根因 B：复制入口与分享行为混用

当前 `onCopyName` 在以下位置被绑定到 `handleShare(...)`：

- `src/screens/Home/Views/Mylist/MusicList/index.tsx`
- `src/components/OnlineList/index.tsx`

这意味着当前菜单项并不是稳定的「复制歌曲名」，而是一个受分享设置影响的分享/复制混合入口。对媒体库歌曲而言，这不足以满足查看与复制详情的诉求。

---

## 3. 设计原则

### 3.1 优先补齐只读详情，不引入重导航

本版以弹窗为载体，而不是新页面。原因：

1. 当前问题是入口失效与信息不可见；
2. 弹窗改动集中，风险低；
3. 不改变现有单击播放的交互习惯。

### 3.2 媒体库歌曲与在线音源歌曲分流处理

- **媒体库 / 本地文件歌曲：** 打开应用内只读详情弹窗；
- **在线音源歌曲：** 继续保留现有外部详情页跳转行为。

### 3.3 复制能力集中在详情弹窗内提供

本版不直接改造现有菜单里的「分享歌曲」逻辑，而是在详情弹窗内提供稳定、明确、与媒体库场景强相关的复制动作。

### 3.4 不可用歌曲也应允许查看详情

即使歌曲已标记为 `connection_removed` 或 `rule_removed`，仍然允许打开详情弹窗，用于查看：

- 原有歌曲名与歌手；
- 来源类型；
- 远程路径；
- 不可用原因。

这有助于用户排查为什么条目失效，而不是只看到一个不可操作的菜单项。

---

## 4. 入口与行为范围

### 4.1 本版生效入口

入口位置：

- `我的列表` → 歌曲行右侧更多菜单 → `歌曲详情页`

### 4.2 本版覆盖的歌曲类型

本版详情弹窗覆盖以下歌曲：

1. 普通本地歌曲；
2. 媒体库本地歌曲；
3. WebDAV 歌曲；
4. SMB 歌曲；
5. OneDrive 歌曲。

### 4.3 行为矩阵

| 歌曲类型 | 点击「歌曲详情页」行为 |
| --- | --- |
| 在线音源歌曲 | 保持现有外部详情页跳转 |
| 本地歌曲 | 打开应用内详情弹窗 |
| 带 `meta.mediaLibrary` 的歌曲 | 打开应用内详情弹窗 |
| 媒体库不可用歌曲 | 仍允许打开应用内详情弹窗 |

### 4.4 菜单项可用性调整

当前 `ListMenu.tsx` 中，`musicSourceDetail` 对以下情况会禁用：

- `musicInfo.source == 'local'`
- `isUnavailable == true`

本版调整为：

1. **本地歌曲不再因为 `source == 'local'` 被禁用；**
2. **媒体库不可用歌曲不再因为 `isUnavailable` 被禁用；**
3. 仅在明确无法提供任何详情展示的情况下才允许禁用。

---

## 5. 详情弹窗信息结构

本版详情弹窗为**只读信息弹窗**，不提供编辑能力。

### 5.1 基本信息

所有支持类型统一展示以下字段：

- 歌名
- 歌手
- 专辑
- 时长
- 来源类型

其中「来源类型」展示用户可理解的标签，例如：

- Local
- WebDAV
- SMB
- OneDrive

### 5.2 文件 / 路径信息

#### 本地歌曲

展示：

- 本地文件路径 `filePath`
- 扩展名 `ext`

#### 媒体库远端歌曲

展示：

- 远程路径 / URI `remotePathOrUri`
- 文件名 `fileName`
- 修改时间 `modifiedTime`
- 版本标记 `versionToken`

若某字段为空，则该字段整行隐藏，不展示空壳占位。

### 5.3 媒体库归档信息

当 `meta.mediaLibrary` 存在时，展示：

- 连接 ID `connectionId`
- 来源项 ID `sourceItemId`
- 聚合歌曲 ID `aggregateSongId`
- 优选来源项 ID `preferredSourceItemId`（有值时才显示）
- Provider 类型 `providerType`

### 5.4 状态信息

当歌曲包含不可用原因时，弹窗顶部或状态区展示只读提示：

- `connection_removed`：连接已移除
- `rule_removed`：规则已移除

状态文案需通过 i18n 提供，避免直接裸露内部枚举值。

---

## 6. 复制动作设计

### 6.1 复制动作列表

详情弹窗内提供以下 4 个复制动作：

1. 复制歌名
2. 复制歌手 - 歌名
3. 复制完整详情
4. 复制路径

### 6.2 动作含义

#### 复制歌名

只复制歌曲名，例如：

```text
夜曲
```

#### 复制歌手 - 歌名

复制适合聊天或搜索的简短文本，例如：

```text
周杰伦 - 夜曲
```

若歌手为空，则退化为仅复制歌名。

#### 复制完整详情

复制完整只读信息摘要，便于排障、记录或分享。推荐格式如下：

```text
歌名：夜曲
歌手：周杰伦
专辑：十一月的萧邦
时长：03:46
来源：WebDAV
连接 ID：conn_music
远程路径：/Music/Jay/夜曲.mp3
文件名：夜曲.mp3
版本：etag_xxx
```

具体输出遵循以下规则：

1. 仅拼接当前歌曲已存在的字段；
2. 缺失字段不输出空行；
3. 字段顺序固定，便于阅读与比对。

#### 复制路径

- 本地歌曲复制 `filePath`
- 媒体库远端歌曲复制 `remotePathOrUri`

若路径字段不存在，则按钮禁用或点击后不触发复制。

### 6.3 复制成功反馈

所有复制动作都应复用现有剪贴板工具与 toast 提示，统一反馈「已复制」类文案。

---

## 7. 交互与 UI 约定

### 7.1 展示形态

本版采用应用内居中弹窗，不新增导航路由。

建议结构：

1. 标题区：歌曲详情
2. 内容区：按信息分组展示
3. 动作区：复制按钮组 + 关闭按钮

### 7.2 信息排版

建议分为以下分组：

- 基本信息
- 文件信息
- 媒体库信息
- 状态信息

字段展示形式统一为：

- 左侧：字段名
- 右侧：字段值

对于路径、URI、ID 这类长文本：

- 默认允许换行；
- 保持可完整查看；
- 避免单行截断导致关键信息丢失。

### 7.3 空字段与只读约束

- 没有值的字段整行隐藏；
- 不提供在线编辑、跳转修改、重新扫描等动作；
- 本版仅负责「查看」与「复制」。

---

## 8. 数据来源与字段映射

### 8.1 输入来源

详情弹窗基于当前 `LX.Music.MusicInfo` 构建展示模型。

主要读取字段：

- `musicInfo.name`
- `musicInfo.singer`
- `musicInfo.interval`
- `musicInfo.source`
- `musicInfo.meta.albumName`
- `musicInfo.meta.filePath`
- `musicInfo.meta.ext`
- `musicInfo.meta.mediaLibrary.*`

### 8.2 本地歌曲字段来源

| 展示字段 | 来源 |
| --- | --- |
| 歌名 | `musicInfo.name` |
| 歌手 | `musicInfo.singer` |
| 专辑 | `musicInfo.meta.albumName` |
| 时长 | `musicInfo.interval` |
| 路径 | `musicInfo.meta.filePath` |
| 扩展名 | `musicInfo.meta.ext` |

### 8.3 媒体库歌曲字段来源

| 展示字段 | 来源 |
| --- | --- |
| 来源类型 | `musicInfo.meta.mediaLibrary.providerType` |
| 连接 ID | `musicInfo.meta.mediaLibrary.connectionId` |
| 来源项 ID | `musicInfo.meta.mediaLibrary.sourceItemId` |
| 聚合歌曲 ID | `musicInfo.meta.mediaLibrary.aggregateSongId` |
| 路径 / URI | `musicInfo.meta.mediaLibrary.remotePathOrUri` |
| 文件名 | `musicInfo.meta.mediaLibrary.fileName` |
| 修改时间 | `musicInfo.meta.mediaLibrary.modifiedTime` |
| 版本标记 | `musicInfo.meta.mediaLibrary.versionToken` |
| 优选来源项 ID | `musicInfo.meta.mediaLibrary.preferredSourceItemId` |
| 不可用原因 | `musicInfo.meta.mediaLibrary.unavailableReason` |

---

## 9. 实现边界

### 9.1 本版明确要做

1. 在「我的列表」中补齐媒体库 / 本地歌曲的应用内详情弹窗；
2. 调整详情菜单可用性，让本地与不可用媒体库歌曲可查看详情；
3. 在详情弹窗内提供 4 个复制动作；
4. 为新增文案补齐中、繁、英 i18n 键值；
5. 补充自动化测试，覆盖入口路由与复制动作存在性。

### 9.2 本版明确不做

1. 不新增独立全屏歌曲详情页；
2. 不改变歌曲单击播放行为；
3. 不重写在线音源外链详情逻辑；
4. 不在本轮把现有「分享歌曲」菜单项改成真正的「复制歌曲名」；
5. 不在搜索页或其他列表入口同步引入新详情交互。

---

## 10. 测试策略

### 10.1 需要覆盖的回归点

1. 媒体库歌曲菜单中的 `歌曲详情页` 对 `webdav / smb / onedrive / local` 可打开详情弹窗；
2. `unavailable` 媒体库歌曲仍可打开详情弹窗；
3. 在线音源歌曲仍保持原有外链详情行为；
4. 详情弹窗中存在 4 个复制动作；
5. 复制路径动作会根据本地 / 远端歌曲选择正确字段。

### 10.2 测试层级建议

优先使用现有 Node 测试风格做静态契约与行为测试：

- 组件 / 菜单文件结构断言；
- 行为分流断言；
- 详情模型构建函数断言；
- i18n 文案键存在性断言。

若后续已有 UI 测试基础，再补更细的交互测试。

---

## 11. 推荐实现落点

### 11.1 现有文件调整

- `src/screens/Home/Views/Mylist/MusicList/ListMenu.tsx`
- `src/screens/Home/Views/Mylist/MusicList/listAction.ts`
- `src/screens/Home/Views/Mylist/MusicList/index.tsx`

### 11.2 新增组件建议

建议新增一个可复用组件：

- `src/components/MusicDetailModal/index.tsx`

如需拆分，可进一步拆为：

- `src/components/MusicDetailModal/index.tsx`
- `src/components/MusicDetailModal/buildDetailSections.ts`

其中 `buildDetailSections.ts` 负责把 `LX.Music.MusicInfo` 转成只读展示模型，便于单测覆盖。

### 11.3 文案文件

- `src/lang/zh-cn.json`
- `src/lang/zh-tw.json`
- `src/lang/en-us.json`

---

## 12. 后续演进方向（非本版范围）

以下内容不属于本版实现范围，但设计上不应阻断后续扩展：

1. 将详情弹窗升级为独立详情页；
2. 在搜索页 `LibraryMusicList` 中接入同款详情入口；
3. 在详情页中增加缓存状态、来源切换、重新扫描等高级能力；
4. 重新梳理菜单中的「分享歌曲」与「复制歌曲名」语义。

---

## 13. 变更记录

- v1（2026-05-15）：首次定义媒体库歌曲详情弹窗的目标范围、字段结构、复制动作与交互边界。

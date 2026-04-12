# 年终播放分析埋点设计

日期：2026-04-12  
状态：已确认，待写实施计划

## 概述

当前媒体库播放链路已经具备三块基础能力：

1. 按聚合歌曲累计的 `playStats`
2. 按单次会话记录的 `playHistory`
3. 按时间范围导出的播放历史 JSON

这些能力已经足够支撑“累计播放次数 / 累计播放时长 / 单次播放开始结束时间”的基础统计，但还不足以支撑更完整的年终报告。当前主要缺口不是“有没有播放时长”，而是缺少年终报告高频维度对应的稳定事实字段，例如：

1. 这次播放是怎么开始的（搜索、列表点歌、自动下一首、恢复播放等）
2. 这次播放是怎么结束的（自然播完、手动下一首、手动停止、报错等）
3. 这次播放发生在什么时间标签下（年份、月份、星期几、时段、季节、夜间归属日）
4. 这次播放对应的歌曲 / 歌手 / 专辑名称快照
5. 这次播放所在的列表上下文
6. 这次播放中发生了多少次 seek、快进和回退多少秒

用户后续会主要通过本地 HTML、MSSQL、帆软等外部方式生成类似网易云年报的统计页面，因此本设计的目标不是把整份年报直接做进 App，而是把“播放事实底座”一次补稳，让后续外部清洗与报表可以直接建立在可靠数据上。

## 目标

1. 扩展媒体库 `playHistory`，让单次播放记录携带足够完整的年终报告事实字段。
2. 保留现有 `playStats` 作为按歌曲累计统计，同时让 `playHistory` 成为更完整的事实源。
3. 新增稳定的年度聚合与全生命周期首次出现索引，降低后续 App 内或外部报表重复扫描全量历史的成本。
4. 统一时间口径：
   1. 年终报告常用时间段按播放开始时间归档；
   2. 日历活跃天数按自然日统计；
   3. 熬夜 / 最晚听歌按“凌晨 6 点前归前一晚”的夜间归属日统计。
5. 升级播放历史 JSON 导出，让外部脚本和数据库导入可以直接使用新增埋点字段。
6. 让后续实现“年度歌曲 / 年度歌手 / 年度专辑 / 最爱时段 / 深夜听歌 / 历年最晚”等报告页时，无需再回头补采历史数据。

## 非目标

1. 本次不做 App 内年终报告 UI。
2. 本次不做歌手详情页、歌手歌曲列表、专辑详情页、专辑歌曲列表。
3. 本次不在 App 内实现曲风、语种、BPM、封面颜色、词曲人、歌词词云等内容分析。
4. 本次不强制回写旧 `playHistory` 的新增字段，只允许在聚合重建时做 best-effort 衍生。
5. 本次不把所有在线源歌曲都纳入同一套年终埋点，仍以媒体库歌曲链路为主。
6. 本次不直接生成网易云式 32 页成品报告，只提供数据底座。

## 现状与问题

### 已有能力

1. `playStats` 可以累计歌曲维度的播放次数与累计播放时长。
2. `playHistory` 已经记录：
   1. `aggregateSongId`
   2. `sourceItemId`
   3. `startedAt`
   4. `endedAt`
   5. `listenedSec`
   6. `durationSec`
   7. `countedPlay`
3. 播放历史导出可以按时间范围筛选，并关联歌曲信息导出 JSON。

### 主要缺口

1. 无法区分主动探索和被动续播：没有 `entrySource`。
2. 无法区分自然播完和手动切歌：没有 `endReason`。
3. 无法稳定做“最爱时段 / 最晚听歌 / 深夜听歌”：没有时间标签与夜间归属口径。
4. 歌手 / 专辑当前主要通过 `aggregateSongId -> aggregateSongs` 反查，不是历史快照；后续 metadata 变化会污染历史报表。
5. 无法分析 seek 行为：没有 seek 次数和前后跳累计秒数。
6. 恢复备份或重建报表时，需要每次从原始历史做大量重复计算。

## 总体架构

本次设计把数据底座分成两层：

### 1. 原始会话层：扩展 `playHistory`

`playHistory` 继续作为单次播放事实源，记录一次播放会话在“当时当刻”的完整信息：

1. 会话开始 / 结束时间与已听秒数
2. 歌曲 / 歌手 / 专辑快照
3. 时间标签
4. 入口来源与结束原因
5. seek 行为与列表上下文

后续所有年终报告、外部清洗和聚合重建，都优先依赖 `playHistory`。

### 2. 派生缓存层：年度聚合与首次出现索引

新增一层稳定的派生缓存，负责保存通用统计结果：

1. `yearSummary`
2. `yearTimeStats`
3. `yearEntityStats`
4. `lifetimeEntityIndex`

这些数据的定位是“派生缓存”，而不是唯一事实源。即使聚合结构未来变化，也可以从 `playHistory` 重建。

## 原始会话层设计：`playHistory` 扩展字段

### 保留现有字段

1. `aggregateSongId`
2. `sourceItemId`
3. `startedAt`
4. `endedAt`
5. `listenedSec`
6. `durationSec`
7. `countedPlay`

### 新增会话行为字段

1. `completionRate: number`
   1. 计算方式：`durationSec > 0 ? listenedSec / durationSec : 0`
   2. 落库前限制在 `0 ~ 1`
2. `endReason: PlaybackEndReason`
3. `entrySource: PlaybackEntrySource`
4. `seekCount: number`
5. `seekForwardSec: number`
6. `seekBackwardSec: number`

### 新增时间标签字段

1. `startYear: number`
2. `startMonth: number`
3. `startDay: number`
4. `startDateKey: string`，格式 `YYYY-MM-DD`
5. `startWeekday: number`，使用 `1-7`
6. `startHour: number`，使用 `0-23`
7. `startSeason: PlaybackSeason`
8. `startTimeBucket: PlaybackTimeBucket`
9. `nightOwningDateKey: string`，用于深夜 / 熬夜 / 最晚听歌统计
10. `nightSortMinute: number`，用于比较“某一晚最晚听到几点”

### 新增内容快照字段

1. `titleSnapshot: string`
2. `artistSnapshot: string`
3. `albumSnapshot: string`
4. `providerTypeSnapshot: LX.MediaLibrary.ProviderType | ''`
5. `fileNameSnapshot: string`
6. `remotePathSnapshot: string`

### 新增播放上下文字段

1. `listIdSnapshot: string | null`
2. `listTypeSnapshot: PlaybackListType`

## 枚举与口径定义

### `PlaybackEndReason`

1. `completed`
2. `manual_next`
3. `manual_prev`
4. `manual_stop`
5. `switch_music`
6. `error`
7. `app_exit`
8. `unknown`

### `PlaybackEntrySource`

1. `search`
2. `list_click`
3. `auto_next`
4. `manual_next_prev`
5. `restore`
6. `deeplink`
7. `temp_play`
8. `unknown`

### `PlaybackSeason`

1. `spring`：3-5 月
2. `summer`：6-8 月
3. `autumn`：9-11 月
4. `winter`：12-2 月

### `PlaybackTimeBucket`

1. `late_night`：00:00 - 05:59
2. `morning`：06:00 - 10:59
3. `noon`：11:00 - 13:59
4. `afternoon`：14:00 - 17:59
5. `evening`：18:00 - 21:59
6. `night`：22:00 - 23:59

### `PlaybackListType`

1. `default`
2. `love`
3. `user`
4. `generated_media`
5. `search`
6. `temp`
7. `unknown`

## 日期与夜间统计口径

### 自然日口径：`startDateKey`

`startDateKey` 直接取 `startedAt` 在本地时区下的自然日期，用于：

1. 听歌活跃天数
2. 全年日历图
3. 连续听歌天数
4. 当年哪几天听过歌

示例：`2026-01-02 00:30` 的 `startDateKey` 为 `2026-01-02`。

### 夜间归属口径：`nightOwningDateKey`

用于“熬夜听歌 / 历年最晚听歌”等统计，规则为：

1. 如果开始时间早于本地时间 `06:00`，归属到前一晚；
2. 否则归属到当天晚上。

示例：

1. `2026-01-02 00:30` 的 `nightOwningDateKey = 2026-01-01`
2. `2026-01-02 23:40` 的 `nightOwningDateKey = 2026-01-02`

### 夜间最晚排序：`nightSortMinute`

用于比较“同一晚最晚听到几点”，规则为：

1. 22:00 - 23:59：按当天分钟数 `1320 - 1439`
2. 00:00 - 05:59：按 `1440 + 当前分钟数`

示例：

1. `23:30` -> `1410`
2. `00:30` -> `1470`
3. `02:15` -> `1575`

## 派生缓存层设计

### `yearSummary`

按年份维护一条总览记录，字段至少包括：

1. `year`
2. `totalSessions`
3. `totalListenedSec`
4. `totalCountedPlays`
5. `activeDays`
6. `distinctSongs`
7. `distinctArtists`
8. `distinctAlbums`
9. `latestPlayedAt`
10. `newSongs`
11. `newArtists`
12. `newAlbums`

### `yearTimeStats`

按年维护时间维度分布：

1. `byMonth`
2. `byWeekday`
3. `byHour`
4. `byTimeBucket`
5. `bySeason`
6. `byDateKey`
7. `nightlyLatestByDate`
8. `lateNightNights`
9. `latestNightSession`

每个普通桶至少维护：

1. `sessions`
2. `countedPlays`
3. `listenedSec`

### `yearEntityStats`

按年分别维护：

1. `songs`
2. `artists`
3. `albums`

每个实体至少累计：

1. `sessions`
2. `countedPlays`
3. `listenedSec`
4. `activeDays`
5. `firstStartedAt`
6. `lastStartedAt`
7. 对应的展示快照

#### `songs` key

使用 `aggregateSongId` 作为主 key，并保留：

1. `titleSnapshot`
2. `artistSnapshot`
3. `albumSnapshot`

#### `artists` key

使用归一化后的 `artistSnapshot` 作为 key，并保留：

1. `artistSnapshot`

#### `albums` key

使用 `artistSnapshot + albumSnapshot` 组合归一化 key，避免同名专辑冲突，并保留：

1. `artistSnapshot`
2. `albumSnapshot`

### `lifetimeEntityIndex`

维护全生命周期首次出现记录：

1. `songFirstSeen`
2. `artistFirstSeen`
3. `albumFirstSeen`

每条记录至少包括：

1. `entityKey`
2. `firstStartedAt`
3. `firstYear`
4. `firstDateKey`
5. 实体快照字段

它用于支撑：

1. 新歌占比
2. 新歌手数量
3. 某歌手第一次出现时间
4. 某歌曲第一次出现时间
5. 历年轨迹统计

## 播放链路采集方案

### 运行时上下文模块

新增一个专门的运行时模块，用于管理三类内存上下文：

1. `pendingEntryContext`
2. `pendingEndReason`
3. `currentSessionRuntime`

它不负责 UI，也不直接负责渲染，只为 `analyticsRecorder` 与播放链路提供统一上下文。

### `entrySource` 采集节点

#### 列表点歌

在调用 `playList()` / `playListById()` 的上层调用点显式传入来源：

1. 搜索结果点歌 -> `search`
2. 我的列表 / 排行榜 / 歌单详情 / 普通列表点歌 -> `list_click`

#### 自动下一首

在自然播完触发 `playNext(true)` 前：

1. 当前会话 `endReason = completed`
2. 下一次会话 `entrySource = auto_next`

#### 手动上一首 / 下一首

1. 手动 `playNext(false)`：
   1. 当前会话 `endReason = manual_next`
   2. 下一次会话 `entrySource = manual_next_prev`
2. 手动 `playPrev(false)`：
   1. 当前会话 `endReason = manual_prev`
   2. 下一次会话 `entrySource = manual_next_prev`

#### 恢复播放

在恢复上次播放链路开始前设置 `entrySource = restore`。

#### deeplink / 文件打开

1. 外部 deeplink 直接触发播放 -> `deeplink`
2. 外部文件或 deeplink 先进入临时播放队列，真正轮到播放时 -> `temp_play`

### temp queue 上下文

稍后播放不会立即播放，单靠全局 `pendingEntryContext` 容易丢失来源，因此临时播放队列条目需要携带一份轻量 analytics context。真正从队列头取出并播放时，再转成当前会话的 `entrySource`。

### 会话开始时固化的内容

在 `startAnalyticsSession()` 节点一次性固化：

1. 时间标签
2. 内容快照
3. 列表快照
4. `entrySource`
5. 会话开始时间

这样后续即使 metadata 变化，也不会污染当前会话记录。

### seek 统计采集

在用户显式 seek 的链路里记录：

1. `seekCount += 1`
2. `toSec > fromSec` 时累计到 `seekForwardSec`
3. `toSec < fromSec` 时累计到 `seekBackwardSec`

seek 统计不要依赖播放进度差值去猜测，优先在明确的 seek 入口记录。

### `endReason` 采集顺序

`endReason` 必须在触发 `musicToggled`、`stop`、`error` 等会导致 `finishSession()` 的动作之前先写入运行时上下文。

#### 具体规则

1. 切到另一首歌：
   1. 手动下一首 -> `manual_next`
   2. 手动上一首 -> `manual_prev`
   3. 列表里直接点另一首 -> `switch_music`
2. 自然播完 -> `completed`
3. 手动 stop -> `manual_stop`
4. 播放错误 -> `error`
5. 明确可观察的退出路径 -> `app_exit`
6. 其他无法确认的退出 -> `unknown`

## 落库与重建顺序

### 会话结束时的写入顺序

1. 先写扩展后的 `playHistory`
2. 再更新 `playStats`
3. 再更新 `yearSummary`
4. 再更新 `yearTimeStats`
5. 再更新 `yearEntityStats`
6. 再更新 `lifetimeEntityIndex`

这样可以保证：

1. `playHistory` 始终是最原始、最可靠的事实源
2. 聚合与索引永远可以从 `playHistory` 回放重建

### 备份 / 恢复策略

1. `playHistory` 继续作为正式备份数据保留
2. 聚合和首次索引可以持久化，但视为可重建缓存
3. 恢复旧备份或检测到聚合缺失时，支持从 `playHistory` 重新构建：
   1. `yearSummary`
   2. `yearTimeStats`
   3. `yearEntityStats`
   4. `lifetimeEntityIndex`

### 旧历史兼容

对旧 `playHistory`：

1. 不强制补写新增字段回原始记录
2. 重建聚合时允许 best-effort 衍生：
   1. 时间标签可以从 `startedAt` 直接计算
   2. 歌曲快照可以尽量从当前 `aggregateSongs` / `sourceItems` 补齐
   3. `entrySource` / `endReason` / seek 相关缺失时保持 `unknown` 或 0

## 导出策略

现有播放历史 JSON 导出必须同步升级，导出结果中的 `items` 直接携带新增会话字段，包括：

1. 行为字段
2. 时间标签
3. 内容快照
4. 列表上下文

不要求强制把年度聚合和首次索引一起导出。导出的默认事实源仍然是“扩展后的 `playHistory`”，让外部 HTML、MSSQL、帆软按需清洗聚合。

## 错误处理与一致性原则

1. 无法确认的来源或结束原因统一落为 `unknown`，避免伪精确。
2. 快照字段在会话开始时取值，后续不回写。
3. 聚合更新失败时，不应回滚已经成功写入的 `playHistory`；聚合可以后续重建。
4. 聚合结构变化时，优先保证 `playHistory` 兼容，再通过重建升级缓存层。
5. 对 temp queue、restore、deeplink 等特殊入口，必须显式传上下文，避免靠当前页面或当前状态推断来源。

## 测试策略

### 1. 纯逻辑测试

覆盖：

1. `startTimeBucket` 分桶
2. `startSeason` 归类
3. `nightOwningDateKey`
4. `nightSortMinute`
5. `completionRate`
6. `listTypeSnapshot` 推断
7. `artist` / `album` entity key 归一化

### 2. 会话埋点测试

覆盖：

1. `startSession` 时固化快照与时间标签
2. seek 统计累计正确
3. `finishSession` 产出完整 `playHistory` 记录
4. `entrySource` 与 `endReason` 不串值

### 3. 播放链路集成测试

覆盖：

1. 列表点歌 -> `list_click`
2. 搜索点歌 -> `search`
3. 自动下一首 -> `completed + auto_next`
4. 手动上一首 / 下一首 -> `manual_prev/manual_next + manual_next_prev`
5. stop -> `manual_stop`
6. error -> `error`
7. restore -> `restore`
8. deeplink / 文件打开 -> `deeplink` 或 `temp_play`

### 4. 导出 / 重建测试

覆盖：

1. JSON 导出包含新增字段
2. 从旧备份恢复后可重建聚合
3. 聚合缺失时可以从 `playHistory` 重建
4. 外部分析依赖的原始历史 JSON 结构稳定

## 实施顺序建议

### 阶段 1：类型与存储

1. 扩展 `PlayHistoryEntry` 类型
2. 新增聚合类型与仓储接口
3. 增加重建接口

### 阶段 2：运行时上下文

1. 新增播放分析 runtime 模块
2. 接入 `entrySource`
3. 接入 `endReason`
4. 接入 seek 统计

### 阶段 3：会话快照与落库

1. 在会话开始时固化时间标签、快照、列表上下文
2. 在会话结束时生成完整 `playHistory`
3. 保持 `playStats` 继续按歌曲累计

### 阶段 4：年度聚合与首次索引

1. 写入 `yearSummary`
2. 写入 `yearTimeStats`
3. 写入 `yearEntityStats`
4. 写入 `lifetimeEntityIndex`

### 阶段 5：导出与恢复重建

1. 升级播放历史 JSON 导出
2. 备份恢复后支持重建聚合
3. 聚合缺失时支持回放重建

### 阶段 6：回归测试

1. 纯逻辑测试
2. 会话测试
3. 播放链路集成测试
4. 导出 / 重建测试

## 结果预期

完成本设计后，App 将具备一套稳定、可导出、可重建的播放事实底座，足以支撑以下类型的年终报告与外部报表：

1. 年度总时长、总播放数、活跃天数
2. 新歌 / 新歌手占比
3. 年度最爱歌曲 / 歌手 / 专辑
4. 四季最爱、最爱时间段、周几听歌习惯
5. 熬夜听歌、历年最晚听歌记录
6. 反复听歌曲、歌手轨迹、历年榜单

同时保留与外部 enrichment 协作的边界：

1. App 负责“播放事实记录”
2. 外部 HTML / MSSQL / 帆软负责“曲风、语种、BPM、词曲人、封面颜色、词云”等内容分析

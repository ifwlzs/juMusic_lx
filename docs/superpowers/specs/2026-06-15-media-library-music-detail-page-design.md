# 媒体库歌曲详情独立页设计规范

日期：2026-06-15  
状态：已确认（按方案 B + A 进入实现计划）

## 1. 背景与目标

当前媒体库 / 本地歌曲详情已经通过 `MusicDetailModal` 提供只读信息、复制动作与歌手入口，但弹窗承载空间有限。随着详情字段、状态和后续排障能力增加，继续把内容塞进弹窗会造成阅读困难，也不利于后续扩展。

本版目标是将「我的列表」中的应用内歌曲详情主入口升级为独立详情页，让用户在更完整的页面空间中查看媒体库 / 本地歌曲详情，并保持现有在线音源外链详情行为不变。

## 2. 本版范围

本版要做：

1. 新增媒体库歌曲详情独立页面；
2. 「我的列表」中本地歌曲与带 `meta.mediaLibrary` 的歌曲点击「歌曲详情页」时进入独立页面；
3. 在线音源歌曲继续走现有外部详情页 URL；
4. 独立页面复用现有详情模型与复制动作；
5. 独立页面中歌手可点击，进入现有媒体库歌手页；
6. 保留旧 `MusicDetailModal`，不在本版删除。

本版不做：

1. 搜索页 `LibraryMusicList` 详情入口；
2. 缓存状态、来源切换、重新扫描等高级排障能力；
3. 全局重构「分享歌曲」与「复制歌曲名」菜单语义；
4. 删除旧弹窗组件；
5. 改变歌曲单击播放行为。

## 3. 产品决策

采用方案 B + A：

- 方案 B：新独立页面作为主入口，旧弹窗暂时保留；
- 方案 A：详情页点击歌手沿用现有媒体库歌手页逻辑。

该方案的理由：

1. 独立页解决弹窗太小的核心问题；
2. 保留旧弹窗降低回归风险；
3. 复用现有详情纯函数，避免重复维护字段映射；
4. 歌手入口与播放页保持一致，减少交互分叉。

## 4. 导航设计

新增导航 screen：

```ts
MUSIC_DETAIL_SCREEN = 'lxm.MusicDetailScreen'
```

新增页面：

```text
src/screens/MusicDetailPage/index.tsx
```

新增导航方法：

```ts
pushMusicDetailScreen(componentId, {
  musicInfo,
  sourceListId,
})
```

参数说明：

- `musicInfo`：当前要展示详情的 `LX.Music.MusicInfo`；
- `sourceListId`：详情来源列表 ID，第一版主要用于保留调用上下文，后续搜索页或列表范围行为可复用。

导航行为：

1. 通过 `Navigation.push()` 压入当前栈；
2. 页面关闭使用 `pop(componentId)`；
3. 状态栏使用主题明暗色逻辑；
4. Header 必须避让异形屏状态栏安全区。

## 5. 入口分流

现有分流函数继续保留：

```ts
isInternalMusicDetailTarget(musicInfo)
```

行为矩阵：

| 歌曲类型 | 点击「歌曲详情页」行为 |
| --- | --- |
| 在线音源歌曲 | 保持外部详情页 URL |
| 普通本地歌曲 | 进入独立详情页 |
| 媒体库本地歌曲 | 进入独立详情页 |
| WebDAV / SMB / OneDrive 歌曲 | 进入独立详情页 |
| 媒体库不可用歌曲 | 仍进入独立详情页 |

`MusicList/index.tsx` 中原先调用 `musicDetailModalRef.current?.show(info.musicInfo)` 的主入口改为调用 `pushMusicDetailScreen(...)`。

旧 `MusicDetailModal` 仍保留，避免隐藏入口或历史测试直接失效。

## 6. 页面结构

独立详情页结构：

```text
PageContent
  StatusBar
  Header
    返回按钮
    标题：歌曲详情
  ScrollView
    摘要区
      歌名
      歌手入口
      来源 / 状态摘要
    复制按钮组
    详情分组
      基本信息
      文件信息
      媒体库信息
      状态信息
```

页面必须复用：

```ts
buildMusicDetailSections(musicInfo)
buildMusicDetailCopyText(action, musicInfo)
getMusicDetailCopyActions(musicInfo)
```

这样可保证页面展示、旧弹窗展示和复制文本继续来自同一套数据模型。

## 7. UI 与安全区

页面使用现有基础组件：

- `PageContent`
- `StatusBar`
- `Button`
- `Text`
- `Icon`

Header 要求：

1. 使用 `useStatusbarHeight()`；
2. Header 总高度为内容高度 + 状态栏高度；
3. Header 设置 `paddingTop: statusBarHeight`；
4. 避免异形屏状态栏与标题 / 返回按钮重叠。

内容要求：

1. 使用 `ScrollView` 承载详情字段；
2. 路径、URI、ID 等长字段允许换行；
3. 空字段不展示，继续由 `buildMusicDetailSections()` 负责过滤；
4. 不提供编辑入口。

## 8. 复制动作

独立页提供与旧弹窗一致的复制动作：

1. 复制歌名；
2. 复制歌手 - 歌名；
3. 复制完整详情；
4. 复制路径。

复制行为：

1. 点击后调用 `buildMusicDetailCopyText(action, musicInfo)`；
2. 文本为空时不写剪贴板；
3. 非空时调用 `clipboardWriteText(text)`；
4. 成功后复用现有复制 toast 文案。

## 9. 歌手入口

详情页中的歌手入口沿用现有媒体库歌手页逻辑：

1. 无歌手：toast；
2. 单歌手：直接查询媒体库并进入歌手页；
3. 多歌手：弹底部选择；
4. 保留完整匹配选项；
5. 无媒体库命中：toast，不进入空页；
6. 有命中：进入 `ArtistPage`。

为避免复制逻辑，现有 `ArtistEntry` 组件需要小幅泛化：

```tsx
<ArtistEntry componentId={componentId} singer={musicInfo.singer} />
```

兼容要求：

1. 播放页不传 `componentId` 时仍默认使用 `commonState.componentIds.playDetail`；
2. 详情页传入自己的 `componentId`，歌手页从详情页继续压栈；
3. 现有播放页歌手入口行为不回归。

## 10. 错误处理

详情页不重新请求详情数据，直接消费传入的 `musicInfo`。

错误与边界：

1. `musicInfo` 缺少部分字段时，详情分组不展示空字段；
2. 复制路径为空时，路径复制按钮保持禁用；
3. 歌手页查询失败时沿用 `ArtistEntry` 的失败 toast；
4. 不可用媒体库歌曲仍允许展示详情。

## 11. 测试策略

新增或更新 Node 测试，覆盖以下契约：

1. `MUSIC_DETAIL_SCREEN` 注册到导航；
2. `pushMusicDetailScreen()` 存在并传递 `musicInfo` / `sourceListId`；
3. `src/screens/MusicDetailPage/index.tsx` 导出页面并使用 `ScrollView`；
4. 页面使用 `buildMusicDetailSections()`、`getMusicDetailCopyActions()`、`buildMusicDetailCopyText()`；
5. 页面使用 `useStatusbarHeight()` 处理 Header 安全区；
6. 页面接入 `ArtistEntry` 且传入 `componentId`；
7. `ArtistEntry` 支持可选 `componentId`，播放页默认行为不变；
8. 「我的列表」内部详情入口调用 `pushMusicDetailScreen()`，不再调用 `MusicDetailModal.show()` 作为主路径；
9. 在线音源详情仍走 `handleShowMusicSourceDetail()`；
10. 旧详情弹窗相关测试继续通过。

## 12. 预计文件

新增：

```text
src/screens/MusicDetailPage/index.tsx
tests/media-library/music-detail-page.test.js
```

修改：

```text
src/navigation/screenNames.ts
src/navigation/registerScreens.tsx
src/navigation/navigation.ts
src/screens/index.ts
src/screens/Home/Views/Mylist/MusicList/index.tsx
src/screens/PlayDetail/components/ArtistEntry.tsx
tests/media-library/music-detail-modal.test.js
tests/play-detail/artist-page-entry.test.js
src/lang/zh-cn.json
src/lang/zh-tw.json
src/lang/en-us.json
CHANGELOG.md
```

文档：

```text
docs/superpowers/specs/2026-06-15-media-library-music-detail-page-design.md
docs/superpowers/plans/2026-06-15-media-library-music-detail-page.md
```

## 13. 后续演进

本版完成后，后续可以继续推进：

1. 搜索页 `LibraryMusicList` 接入同一个独立详情页；
2. 详情页增加缓存状态、缓存路径、缓存有效性；
3. 详情页增加重新扫描、来源切换等高级排障能力；
4. 确认无入口依赖后删除旧 `MusicDetailModal`；
5. 重新梳理全局「分享歌曲」与「复制歌曲名」语义。

## 14. 变更记录

- v1（2026-06-15）：确认独立详情页作为主入口、旧弹窗保留、歌手入口沿用媒体库歌手页逻辑。

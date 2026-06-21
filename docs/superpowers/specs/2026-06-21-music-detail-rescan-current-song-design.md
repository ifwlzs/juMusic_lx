# 歌曲详情页重新扫描当前歌曲设计

## 背景

歌曲详情页已经展示媒体库只读信息和缓存状态，但待办中的“重新扫描”仍未落地。用户选择的范围是 **A1：重新扫描当前歌曲所属导入规则**。该能力用于在发现当前媒体库歌曲元数据、版本或可用性异常时，从歌曲详情页快速提交一次后台增量同步任务。

## 目标

- 仅在当前歌曲是媒体库歌曲时展示“重新扫描当前歌曲”按钮。
- 点击按钮后定位当前歌曲所属的导入规则，并向已有媒体库 job queue 提交导入规则增量同步任务。
- 页面只提交后台任务，不直接扫描远端、不清理缓存、不做删除校验。
- 提交期间禁用按钮，避免重复入队。
- 提供明确 toast：
  - 成功：已提交重新扫描。
  - 找不到规则：未找到可重新扫描的导入规则。
  - 入队异常：重新扫描失败。

## 非目标

- 不做全库扫描。
- 不做全规则全量校验。
- 不做删除校验或缺失文件清理。
- 不直接访问 WebDAV、SMB、OneDrive 或本地 provider。
- 不清理或重建缓存。
- 不实现来源切换。

## 规则定位策略

输入来自歌曲详情页：

- 当前歌曲的 `musicInfo.meta.mediaLibrary`。
- 当前页面入口传入的 `sourceListId`。
- `useMyList()` 读取到的用户列表。
- `mediaLibraryRepository.getImportRules()` 读取到的导入规则。

定位顺序：

1. 当前歌曲必须有 `mediaLibrary.connectionId` 和 `mediaLibrary.remotePathOrUri`；否则不提交。
2. 只考虑 `rule.connectionId === mediaLibrary.connectionId` 的规则，避免跨媒体源误提交。
3. 如果 `sourceListId` 对应的是生成媒体列表，且列表 `mediaSource.ruleId` 存在，则优先使用该规则；但该规则必须覆盖当前歌曲路径，避免旧列表或错误入口导致误提交。
4. 如果列表规则不可用，则从同连接规则中查找覆盖当前歌曲路径的第一条规则。
5. 覆盖判断与导入规则语义一致：
   - 当前歌曲路径在规则的任一目录下时命中。
   - 当前歌曲路径与规则的任一散选歌曲路径完全一致时命中。
   - 路径先做轻量标准化，去除首尾空白和末尾多余 `/`。

## 入队行为

歌曲详情页调用：

```ts
enqueueImportRuleSyncJob({
  connectionId: rule.connectionId,
  ruleId: rule.ruleId,
  previousRule: rule,
  triggerSource: 'manual',
  syncMode: 'incremental',
})
```

这样复用已有后台队列、冲突处理、状态更新和本地/远端 provider 分发逻辑。页面不需要知道 provider 的扫描实现。

## UI 行为

- 按钮放在复制操作区之后、详情分组之前，和已有页面操作保持一致。
- 非媒体库歌曲不展示按钮。
- 提交中按钮禁用，文案切换为“提交中...”。
- 所有异常收敛为 toast，不阻断详情页其他信息查看。

## 测试策略

- 新增纯函数测试覆盖：
  - 目录覆盖。
  - 散选歌曲精确匹配。
  - 不匹配路径返回 false。
  - `sourceListId` 对应生成列表规则优先。
  - 生成列表规则不覆盖当前歌曲时回退到覆盖路径的规则。
  - 找不到规则返回 null。
- 新增页面静态契约测试覆盖：
  - 歌曲详情页接入 `useMyList`、`mediaLibraryRepository.getImportRules`、`findMusicDetailRescanRule` 和 `enqueueImportRuleSyncJob`。
  - 入队参数固定为 `syncMode: 'incremental'`、`triggerSource: 'manual'`、`previousRule: rule`。
  - 页面不出现 `syncMode: 'full_validation'`、`removeCaches`、`saveCaches` 等超范围行为。
- 新增三语言文案 key 检查。
- 更新 `docs/todo/todolist.md` 和 `CHANGELOG.md`，并用测试约束已记录。

# 歌曲详情页重新扫描当前歌曲实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在歌曲详情页为媒体库歌曲增加“重新扫描当前歌曲”入口，提交当前歌曲所属导入规则的后台增量同步任务。

**架构：** 新增 `src/core/mediaLibrary/musicDetailRescan.ts` 承载规则定位纯函数，页面只负责读取当前列表、规则和触发 job queue。详情页不直接访问远端 provider、不清缓存、不做全量校验。

**技术栈：** React Native、TypeScript、Node `node:test`、已有媒体库 `mediaLibraryRepository` 与 `enqueueImportRuleSyncJob`。

---

## 文件结构

- 创建：`src/core/mediaLibrary/musicDetailRescan.ts`
  - 负责路径标准化、规则覆盖判断、按当前列表优先级定位重新扫描规则。
- 修改：`src/screens/MusicDetailPage/index.tsx`
  - 使用 `sourceListId`、`useMyList()`、`mediaLibraryRepository.getImportRules()` 与 `enqueueImportRuleSyncJob()`。
  - 渲染提交按钮并处理提交中状态、toast。
- 修改：`src/lang/zh-cn.json`
  - 增加简体中文重新扫描文案。
- 修改：`src/lang/zh-tw.json`
  - 增加繁体中文重新扫描文案。
- 修改：`src/lang/en-us.json`
  - 增加英文重新扫描文案。
- 创建：`tests/media-library/music-detail-rescan-current-song.test.js`
  - 覆盖纯函数、页面接入契约、i18n、文档记录。
- 修改：`docs/todo/todolist.md`
  - 将“重新扫描”标为完成，并保留“来源切换”未完成。
- 修改：`CHANGELOG.md`
  - 记录歌曲详情页重新扫描当前歌曲能力。
- 创建：`docs/superpowers/specs/2026-06-21-music-detail-rescan-current-song-design.md`
  - 保存已确认范围和设计。

## 任务 1：红灯测试

**文件：**
- 创建：`tests/media-library/music-detail-rescan-current-song.test.js`

- [ ] **步骤 1：编写失败的测试**

新增测试包含以下断言：

```js
test('重新扫描规则覆盖判断支持目录、散选歌曲和不匹配路径', () => {
  const { isSourcePathCoveredByRule } = loadRescanModule()
  assert.equal(isSourcePathCoveredByRule('/Albums/A/song.flac', createRule({ directories: ['/Albums/A'] })), true)
  assert.equal(isSourcePathCoveredByRule('/Singles/song.flac', createRule({ tracks: ['/Singles/song.flac'] })), true)
  assert.equal(isSourcePathCoveredByRule('/Other/song.flac', createRule({ directories: ['/Albums/A'], tracks: ['/Singles/song.flac'] })), false)
})

test('重新扫描规则定位优先使用当前生成列表规则且要求覆盖当前路径', () => {
  const { findMusicDetailRescanRule } = loadRescanModule()
  const selected = findMusicDetailRescanRule({
    mediaLibrary: createMediaLibrary('/Albums/A/song.flac'),
    sourceListId: 'list-current',
    lists: [createGeneratedList('list-current', 'conn_1', 'rule_2')],
    rules: [
      createRule({ ruleId: 'rule_1', directories: ['/Albums'] }),
      createRule({ ruleId: 'rule_2', directories: ['/Albums/A'] }),
    ],
  })
  assert.equal(selected.ruleId, 'rule_2')
})

test('当前生成列表规则不覆盖时回退到覆盖当前路径的规则', () => {
  const { findMusicDetailRescanRule } = loadRescanModule()
  const selected = findMusicDetailRescanRule({
    mediaLibrary: createMediaLibrary('/Albums/A/song.flac'),
    sourceListId: 'list-current',
    lists: [createGeneratedList('list-current', 'conn_1', 'rule_2')],
    rules: [
      createRule({ ruleId: 'rule_1', directories: ['/Albums'] }),
      createRule({ ruleId: 'rule_2', directories: ['/Other'] }),
    ],
  })
  assert.equal(selected.ruleId, 'rule_1')
})

test('找不到覆盖规则时返回 null', () => {
  const { findMusicDetailRescanRule } = loadRescanModule()
  const selected = findMusicDetailRescanRule({
    mediaLibrary: createMediaLibrary('/Albums/A/song.flac'),
    sourceListId: null,
    lists: [],
    rules: [createRule({ ruleId: 'rule_1', directories: ['/Other'] })],
  })
  assert.equal(selected, null)
})
```

并增加页面源码契约、三语言文案、待办与 changelog 断言。

- [ ] **步骤 2：运行测试验证失败**

运行：

```powershell
node --test tests/media-library/music-detail-rescan-current-song.test.js
```

预期：失败，原因包括 `src/core/mediaLibrary/musicDetailRescan.ts` 不存在、页面未导入 `enqueueImportRuleSyncJob`、文案未添加、待办未勾选。

## 任务 2：实现纯函数

**文件：**
- 创建：`src/core/mediaLibrary/musicDetailRescan.ts`
- 测试：`tests/media-library/music-detail-rescan-current-song.test.js`

- [ ] **步骤 1：编写最少实现代码**

实现导出函数：

```ts
export type MusicDetailMediaLibraryInfo = NonNullable<(LX.Music.MusicInfoLocal | LX.Music.MusicInfoRemoteFile)['meta']['mediaLibrary']>

export const normalizeRescanPathOrUri = (pathOrUri: string | null | undefined): string => {
  const value = String(pathOrUri || '').trim()
  if (!value) return ''
  if (value === '/') return '/'
  return value.replace(/\/+$/, '')
}

export const isSourcePathCoveredByRule = (pathOrUri: string | null | undefined, rule: LX.MediaLibrary.ImportRule): boolean => {
  const normalizedPath = normalizeRescanPathOrUri(pathOrUri)
  if (!normalizedPath) return false
  const directories = Array.isArray(rule.directories) ? rule.directories : []
  const tracks = Array.isArray(rule.tracks) ? rule.tracks : []
  if (directories.some(directory => {
    const directoryPath = normalizeRescanPathOrUri(directory.pathOrUri)
    return !!directoryPath && (normalizedPath === directoryPath || normalizedPath.startsWith(`${directoryPath}/`))
  })) return true
  return tracks.some(track => normalizeRescanPathOrUri(track.pathOrUri) === normalizedPath)
}

export const findMusicDetailRescanRule = ({ mediaLibrary, sourceListId, lists = [], rules }: {
  mediaLibrary: MusicDetailMediaLibraryInfo
  sourceListId?: string | null
  lists?: LX.List.UserListInfo[]
  rules: LX.MediaLibrary.ImportRule[]
}): LX.MediaLibrary.ImportRule | null => {
  const sourcePath = normalizeRescanPathOrUri(mediaLibrary.remotePathOrUri)
  if (!mediaLibrary.connectionId || !sourcePath) return null
  const connectionRules = rules.filter(rule => rule.connectionId === mediaLibrary.connectionId)
  const currentList = sourceListId ? lists.find(list => list.id === sourceListId) : null
  const currentRuleId = currentList?.mediaSource?.generated ? currentList.mediaSource.ruleId : undefined
  const currentRule = currentRuleId ? connectionRules.find(rule => rule.ruleId === currentRuleId) : null
  if (currentRule && isSourcePathCoveredByRule(sourcePath, currentRule)) return currentRule
  return connectionRules.find(rule => isSourcePathCoveredByRule(sourcePath, rule)) ?? null
}
```

实际代码必须补充中文注释说明路径标准化、生成列表规则校验和 fallback 意图。

- [ ] **步骤 2：运行测试验证纯函数通过、页面契约仍失败**

运行：

```powershell
node --test tests/media-library/music-detail-rescan-current-song.test.js
```

预期：纯函数相关测试通过，页面/i18n/文档测试仍失败。

## 任务 3：接入歌曲详情页

**文件：**
- 修改：`src/screens/MusicDetailPage/index.tsx`
- 测试：`tests/media-library/music-detail-rescan-current-song.test.js`

- [ ] **步骤 1：编写最少实现代码**

页面改动要点：

```ts
import { enqueueImportRuleSyncJob } from '@/core/mediaLibrary/jobQueue'
import { findMusicDetailRescanRule } from '@/core/mediaLibrary/musicDetailRescan'
import { useMyList } from '@/store/list/hook'
```

组件参数改为：

```ts
export default ({ componentId, musicInfo, sourceListId }: MusicDetailPageProps) => {
```

新增状态和列表：

```ts
const userLists = useMyList()
const [isRescanSubmitting, setRescanSubmitting] = useState(false)
const mediaLibrary = getMediaLibraryInfo(musicInfo)
```

新增 handler：

```ts
const handleRescanCurrentMusic = useCallback(() => {
  if (!mediaLibrary || isRescanSubmitting) return
  setRescanSubmitting(true)
  void (async() => {
    try {
      const rules = await mediaLibraryRepository.getImportRules() as LX.MediaLibrary.ImportRule[]
      const rule = findMusicDetailRescanRule({
        mediaLibrary,
        sourceListId,
        lists: userLists,
        rules,
      })
      if (!rule) {
        toast(t('music_detail_rescan_current_song_no_rule'))
        return
      }
      await enqueueImportRuleSyncJob({
        connectionId: rule.connectionId,
        ruleId: rule.ruleId,
        previousRule: rule,
        triggerSource: 'manual',
        syncMode: 'incremental',
      })
      toast(t('music_detail_rescan_current_song_queued'))
    } catch (error) {
      toast(t('music_detail_rescan_current_song_failed'))
    } finally {
      setRescanSubmitting(false)
    }
  })()
}, [isRescanSubmitting, mediaLibrary, sourceListId, t, userLists])
```

在复制按钮后渲染：

```tsx
{mediaLibrary ? (
  <Button disabled={isRescanSubmitting} style={{ ...styles.rescanButton, backgroundColor: theme['c-button-background'] }} onPress={handleRescanCurrentMusic}>
    <Text color={theme['c-button-font']}>
      {t(isRescanSubmitting ? 'music_detail_rescan_current_song_submitting' : 'music_detail_rescan_current_song')}
    </Text>
  </Button>
) : null}
```

新增 `rescanButton` 样式。实际代码必须包含中文注释说明页面只入队、不直接扫描远端或清缓存。

- [ ] **步骤 2：运行测试验证页面契约通过、文案/文档仍失败**

运行：

```powershell
node --test tests/media-library/music-detail-rescan-current-song.test.js
```

预期：页面契约通过，i18n 或文档测试仍失败。

## 任务 4：补文案和文档记录

**文件：**
- 修改：`src/lang/zh-cn.json`
- 修改：`src/lang/zh-tw.json`
- 修改：`src/lang/en-us.json`
- 修改：`docs/todo/todolist.md`
- 修改：`CHANGELOG.md`

- [ ] **步骤 1：补齐三语言 key**

简体中文：

```json
"music_detail_rescan_current_song": "重新扫描当前歌曲",
"music_detail_rescan_current_song_submitting": "提交中...",
"music_detail_rescan_current_song_queued": "已提交重新扫描",
"music_detail_rescan_current_song_no_rule": "未找到可重新扫描的导入规则",
"music_detail_rescan_current_song_failed": "重新扫描失败"
```

繁体中文：

```json
"music_detail_rescan_current_song": "重新掃描目前歌曲",
"music_detail_rescan_current_song_submitting": "提交中...",
"music_detail_rescan_current_song_queued": "已提交重新掃描",
"music_detail_rescan_current_song_no_rule": "找不到可重新掃描的匯入規則",
"music_detail_rescan_current_song_failed": "重新掃描失敗"
```

英文：

```json
"music_detail_rescan_current_song": "Rescan Current Song",
"music_detail_rescan_current_song_submitting": "Submitting...",
"music_detail_rescan_current_song_queued": "Rescan submitted",
"music_detail_rescan_current_song_no_rule": "No import rule found for rescanning",
"music_detail_rescan_current_song_failed": "Rescan failed"
```

- [ ] **步骤 2：更新待办和 changelog**

`docs/todo/todolist.md`：

```md
  - [x] 重新扫描。
    - 处理结果：歌曲详情页已支持提交当前媒体库歌曲所属导入规则的增量重新扫描；页面只提交后台任务，不直接执行远端扫描、删除校验或缓存清理。
```

`CHANGELOG.md` 顶部未发布区域增加：

```md
- 歌曲详情页新增“重新扫描当前歌曲”，可提交当前媒体库歌曲所属导入规则的后台增量同步任务。
```

- [ ] **步骤 3：运行新测试验证通过**

运行：

```powershell
node --test tests/media-library/music-detail-rescan-current-song.test.js
```

预期：PASS。

## 任务 5：回归验证和提交

**文件：**
- 全部上述变更

- [ ] **步骤 1：运行相关回归**

运行：

```powershell
node --test tests/media-library/music-detail-rescan-current-song.test.js
node --test tests/media-library/music-detail-page.test.js tests/media-library/music-detail-cache-status.test.js tests/media-library/media-source-settings-ui.test.js tests/media-library/media-source-copy.test.js
node --test tests/media-library/*.test.js
node --test tests/play-detail/*.test.js
git diff --check
```

预期：全部 PASS，`git diff --check` 无输出。

- [ ] **步骤 2：运行目标 TypeScript 检查**

运行：

```powershell
$output = npx tsc --noEmit 2>&1
$tscExit = $LASTEXITCODE
$targeted = $output | Select-String -Pattern 'src/screens/MusicDetailPage|src/core/mediaLibrary/musicDetailRescan|src/lang|tests/media-library/music-detail-rescan-current-song'
if ($targeted) {
  $targeted | ForEach-Object { $_.ToString() }
  exit 1
}
"NO_TARGETED_TSC_ERRORS"
"FULL_TSC_EXIT_CODE=$tscExit"
```

预期：输出 `NO_TARGETED_TSC_ERRORS`。全仓历史错误可导致 `FULL_TSC_EXIT_CODE` 非 0，但目标路径不能有错误。

- [ ] **步骤 3：提交功能分支**

运行：

```powershell
git status --short
git add docs/superpowers/specs/2026-06-21-music-detail-rescan-current-song-design.md docs/superpowers/plans/2026-06-21-music-detail-rescan-current-song.md src/core/mediaLibrary/musicDetailRescan.ts src/screens/MusicDetailPage/index.tsx src/lang/zh-cn.json src/lang/zh-tw.json src/lang/en-us.json tests/media-library/music-detail-rescan-current-song.test.js docs/todo/todolist.md CHANGELOG.md
git commit -m "feat: rescan current media song from detail page"
```

预期：生成一个功能提交。

## 任务 6：合并、推送和 Action 检查

**文件：**
- 使用独立 merge worktree，避免打扰主目录既有未跟踪文件。

- [ ] **步骤 1：创建合并 worktree 并合并**

运行：

```powershell
git -C D:\MyCode\Android\juMusic_lx fetch origin main --tags
git -C D:\MyCode\Android\juMusic_lx worktree add -b merge/main-music-detail-rescan-current-song D:\MyCode\Android\juMusic_lx\.worktrees\merge-main-music-detail-rescan-current-song origin/main
git -C D:\MyCode\Android\juMusic_lx\.worktrees\merge-main-music-detail-rescan-current-song merge --no-ff feat/music-detail-rescan-current-song -m "Merge branch 'feat/music-detail-rescan-current-song'"
```

预期：合并成功。

- [ ] **步骤 2：在合并结果上重跑验证**

运行任务 5 的相关回归和目标 TypeScript 检查。

预期：与功能分支一致。

- [ ] **步骤 3：推送 main 并检查 GitHub Action**

运行：

```powershell
git -C D:\MyCode\Android\juMusic_lx\.worktrees\merge-main-music-detail-rescan-current-song push origin HEAD:main
gh run list --limit 10 --json databaseId,displayTitle,workflowName,status,conclusion,headSha,url,createdAt,updatedAt
```

找到本次 `main` head sha 对应 run 后：

```powershell
gh run watch <runId> --exit-status
```

预期：Action 成功；如果失败，读取失败 job 日志并修复。

- [ ] **步骤 4：同步主目录并清理 worktree**

运行：

```powershell
git -C D:\MyCode\Android\juMusic_lx fetch origin main --tags
git -C D:\MyCode\Android\juMusic_lx merge --ff-only origin/main
git -C D:\MyCode\Android\juMusic_lx worktree remove D:\MyCode\Android\juMusic_lx\.worktrees\merge-main-music-detail-rescan-current-song
git -C D:\MyCode\Android\juMusic_lx worktree remove D:\MyCode\Android\juMusic_lx\.worktrees\music-detail-rescan-current-song
git -C D:\MyCode\Android\juMusic_lx branch -d merge/main-music-detail-rescan-current-song
git -C D:\MyCode\Android\juMusic_lx branch -d feat/music-detail-rescan-current-song
```

预期：主目录快进到远端 `main`，既有未跟踪文件保持不动。

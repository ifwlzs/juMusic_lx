# 歌曲详情页缓存状态展示 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在歌曲详情页为媒体库歌曲增加只读缓存状态展示，非媒体库歌曲不展示缓存分组。

**架构：** 将缓存状态组装为独立纯函数，页面只负责读取本地媒体库缓存索引并把缓存分组追加到现有详情分组。实现只读取 `mediaLibraryRepository.findCacheBySourceItemId(...)`，不执行清理、重扫、来源切换或远端访问，避免打开详情页产生写入副作用。

**技术栈：** React Native、TypeScript、LX Music 现有 i18n JSON、Node.js `node:test` 静态/契约测试。

---

## 文件结构

- 创建：`src/components/MusicDetailModal/buildCacheStatusSection.ts`
  - 职责：根据 `LX.Music.MusicInfo` 与可选 `LX.MediaLibrary.MediaCache` 生成缓存状态详情分组；包含文件大小与时间格式化辅助函数。
- 修改：`src/components/MusicDetailModal/buildDetailSections.ts`
  - 职责：把详情分组 key 联合类型扩展为 `cache`，让详情页统一渲染缓存分组。
- 修改：`src/screens/MusicDetailPage/index.tsx`
  - 职责：在页面打开时只读查询媒体库缓存索引，并把缓存分组追加到现有详情分组。
- 修改：`src/lang/zh-cn.json`、`src/lang/zh-tw.json`、`src/lang/en-us.json`
  - 职责：补齐缓存状态展示所需多语言文案。
- 修改：`docs/todo/todolist.md`
  - 职责：把大项拆出“只读缓存状态展示已落地”，保留来源切换、重新扫描等待确认能力。
- 修改：`CHANGELOG.md`
  - 职责：在 `[Unreleased]` 记录歌曲详情页缓存状态展示。
- 创建：`tests/media-library/music-detail-cache-status.test.js`
  - 职责：用契约测试覆盖纯函数、页面接入 repository、i18n key、待办清单记录。

---

### 任务 1：编写缓存状态契约红灯测试

**文件：**
- 创建：`tests/media-library/music-detail-cache-status.test.js`

- [ ] **步骤 1：编写失败的测试**

```js
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
const read = file => fs.readFileSync(path.join(repoRoot, file), 'utf8')

it('定义缓存状态 section 构建器并覆盖三种状态', () => {
  const source = read('src/components/MusicDetailModal/buildCacheStatusSection.ts')
  assert.match(source, /export\s+const\s+buildMusicDetailCacheSection/)
  assert.match(source, /music_detail_cache_status_not_cached/)
  assert.match(source, /music_detail_cache_status_cached/)
  assert.match(source, /music_detail_cache_status_stale/)
  assert.match(source, /versionToken/)
  assert.match(source, /localFilePath/)
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test tests/media-library/music-detail-cache-status.test.js`
预期：FAIL，原因是 `buildCacheStatusSection.ts` 尚不存在或页面尚未接入缓存状态。

---

### 任务 2：实现缓存状态纯函数

**文件：**
- 创建：`src/components/MusicDetailModal/buildCacheStatusSection.ts`
- 修改：`src/components/MusicDetailModal/buildDetailSections.ts`

- [ ] **步骤 1：编写最少实现代码**

实现要点：
- 非媒体库歌曲返回 `null`。
- 媒体库歌曲无缓存返回 `cache` 分组，状态值为 `music_detail_cache_status_not_cached`。
- 缓存版本匹配返回 `music_detail_cache_status_cached`。
- 缓存版本不匹配返回 `music_detail_cache_status_stale`。
- 缓存存在时展示来源、预加载状态、路径、文件大小、创建时间和最近访问时间；空值不展示。
- 文件内为函数和关键分支添加中文注释，说明只做展示格式化，不访问存储。

- [ ] **步骤 2：运行测试验证通过**

运行：`node --test tests/media-library/music-detail-cache-status.test.js`
预期：本任务相关断言 PASS；页面接入相关断言如果尚未实现可以继续 FAIL。

---

### 任务 3：页面只读接入缓存查询

**文件：**
- 修改：`src/screens/MusicDetailPage/index.tsx`

- [ ] **步骤 1：新增页面契约测试**

在 `tests/media-library/music-detail-cache-status.test.js` 中加入断言：

```js
it('歌曲详情页只读查询缓存并追加缓存分组', () => {
  const source = read('src/screens/MusicDetailPage/index.tsx')
  assert.match(source, /mediaLibraryRepository/)
  assert.match(source, /findCacheBySourceItemId/)
  assert.match(source, /buildMusicDetailCacheSection/)
  assert.match(source, /cacheSection \? \[\.\.\.baseSections, cacheSection\] : baseSections/)
  assert.doesNotMatch(source, /removeCaches|saveCaches|scan|rescan/)
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test tests/media-library/music-detail-cache-status.test.js`
预期：FAIL，原因是页面尚未导入 repository 或尚未追加缓存分组。

- [ ] **步骤 3：实现页面接入**

实现要点：
- 引入 `useEffect`、`useMemo`、`useState`。
- 引入 `mediaLibraryRepository` 与 `buildMusicDetailCacheSection`。
- 使用 `findCacheBySourceItemId(...)` 按 `musicInfo.meta.mediaLibrary.sourceItemId` 只读查询。
- effect 内设置 `cancelled` 防止卸载后 setState。
- 查询失败时按无缓存展示，不抛出页面错误。
- 添加中文注释解释“详情页只读查询缓存索引，无写入副作用”。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test tests/media-library/music-detail-cache-status.test.js`
预期：PASS。

---

### 任务 4：补齐多语言和待办记录

**文件：**
- 修改：`src/lang/zh-cn.json`
- 修改：`src/lang/zh-tw.json`
- 修改：`src/lang/en-us.json`
- 修改：`docs/todo/todolist.md`
- 修改：`CHANGELOG.md`

- [ ] **步骤 1：新增 i18n 契约测试**

在测试中读取三份语言文件，断言都包含以下 key：

```js
const requiredKeys = [
  'music_detail_section_cache',
  'music_detail_cache_status',
  'music_detail_cache_status_not_cached',
  'music_detail_cache_status_cached',
  'music_detail_cache_status_stale',
  'music_detail_cache_origin',
  'music_detail_cache_origin_play',
  'music_detail_cache_origin_prefetch',
  'music_detail_cache_prefetch_state',
  'music_detail_cache_prefetch_state_queued',
  'music_detail_cache_prefetch_state_running',
  'music_detail_cache_prefetch_state_ready',
  'music_detail_cache_prefetch_state_failed',
  'music_detail_cache_path',
  'music_detail_cache_file_size',
  'music_detail_cache_created_at',
  'music_detail_cache_last_access_at',
]
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test tests/media-library/music-detail-cache-status.test.js`
预期：FAIL，原因是语言 key 尚未补齐。

- [ ] **步骤 3：补齐文案和文档**

实现要点：
- 中文简体、中文繁体、英文都补齐缓存状态文案。
- `docs/todo/todolist.md` 不直接勾选整个高级能力大项，只勾选/记录只读缓存状态已完成，保留来源切换、重新扫描待确认。
- `CHANGELOG.md` 在 `[Unreleased]` 新增条目。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test tests/media-library/music-detail-cache-status.test.js`
预期：PASS。

---

### 任务 5：全量相关验证、提交、合并推送

**文件：**
- 修改：所有本计划涉及文件

- [ ] **步骤 1：运行目标测试**

运行：

```powershell
node --test tests/media-library/music-detail-cache-status.test.js
node --test tests/media-library/*.test.js
node --test tests/play-detail/*.test.js
git diff --check
```

预期：上述命令退出码为 0。

- [ ] **步骤 2：运行目标 TypeScript 检查**

运行：

```powershell
$output = npx tsc --noEmit 2>&1
$tscExit = $LASTEXITCODE
$targeted = $output | Select-String -Pattern 'src/screens/MusicDetailPage|src/components/MusicDetailModal|src/lang|tests/media-library/music-detail-cache-status'
if ($targeted) { $targeted | ForEach-Object { $_.ToString() }; exit 1 }
"NO_TARGETED_TSC_ERRORS"
"FULL_TSC_EXIT_CODE=$tscExit"
```

预期：输出 `NO_TARGETED_TSC_ERRORS`；仓库既有全量 TypeScript 错误可保留在 `FULL_TSC_EXIT_CODE` 中记录。

- [ ] **步骤 3：提交功能分支**

运行：

```powershell
git status --short
git add src/components/MusicDetailModal/buildCacheStatusSection.ts src/components/MusicDetailModal/buildDetailSections.ts src/screens/MusicDetailPage/index.tsx src/lang/zh-cn.json src/lang/zh-tw.json src/lang/en-us.json tests/media-library/music-detail-cache-status.test.js docs/todo/todolist.md CHANGELOG.md docs/superpowers/plans/2026-06-20-music-detail-cache-status.md
git commit -m "feat: show media cache status in music detail"
```

预期：生成一个功能提交。

- [ ] **步骤 4：合并到 main 并推送**

主目录存在未跟踪文件时，使用独立干净 worktree 合并：

```powershell
git fetch origin main --tags
git worktree add -b merge/main-music-detail-cache-status D:\MyCode\Android\juMusic_lx\.worktrees\merge-main-music-detail-cache-status origin/main
git merge --no-ff feat/music-detail-cache-status -m "Merge branch 'feat/music-detail-cache-status'"
git push origin HEAD:main
```

预期：远端 `main` 包含功能提交与 merge commit。

- [ ] **步骤 5：检查 GitHub Action**

运行：

```powershell
gh run list --limit 5 --json databaseId,displayTitle,workflowName,status,conclusion,headSha,url,createdAt
gh run watch <runId> --exit-status
```

预期：对应 `main` 最新提交的 workflow conclusion 为 `success`。
